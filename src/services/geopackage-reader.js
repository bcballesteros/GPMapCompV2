import { normalizeGeometry, resolveSourceProjection } from './vector-crs.js';

export const GEOPACKAGE_LIMITS = Object.freeze({ bytes: 50 * 1024 * 1024, tables: 200, features: 50000, vertices: 1000000, attributeBytes: 32 * 1024 * 1024, valueBytes: 1024 * 1024 });
const TYPES = new Set(['POINT', 'MULTIPOINT', 'LINESTRING', 'MULTILINESTRING', 'POLYGON', 'MULTIPOLYGON']);
const quote = name => `"${String(name).replaceAll('"', '""')}"`;

export function validateGeoPackageFile(file) {
    if (!file || !/\.gpkg$/i.test(file.name)) throw new Error('Select a GeoPackage (.gpkg) file.');
    if (file.size < 100) throw new Error('The GeoPackage is empty or too short to be a SQLite database.');
    if (file.size > GEOPACKAGE_LIMITS.bytes) throw new Error('GeoPackage files are limited to 50 MiB. Split the dataset in a GIS first.');
}

export function validateGeoPackageHeader(bytes) {
    if (bytes.length < 100 || new TextDecoder().decode(bytes.subarray(0, 16)) !== 'SQLite format 3\0') throw new Error('This file is not a valid SQLite GeoPackage database.');
    const appId = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(68);
    if (![0x47504b47, 0x47503130].includes(appId)) throw new Error('The SQLite database does not have a GeoPackage application identifier.');
}

/** Own every statement so even early failures free it. SQL is fixed, values bound,
 * identifiers quoted, and only physical (non-virtual) tables may be read. */
export function queryRows(db, sql, parameters = [], limit = GEOPACKAGE_LIMITS.tables) {
    const statement = db.prepare(sql);
    try {
        statement.bind(parameters);
        const rows = [];
        while (statement.step()) {
            if (rows.length >= limit) throw new Error('GeoPackage metadata exceeds the supported resource limits.');
            rows.push(statement.getAsObject());
        }
        return rows;
    } finally { statement.free(); }
}

function requireTable(db, name) {
    const [row] = queryRows(db, "SELECT type, sql FROM sqlite_master WHERE name = ?", [name]);
    if (!row || row.type !== 'table' || !/^CREATE\s+TABLE\b/i.test(row.sql || '')) throw new Error(`Unsupported or missing physical table: ${name}`);
}

export function inspectGeoPackage(db) {
    db.run('PRAGMA trusted_schema = OFF');
    db.run('PRAGMA query_only = ON');
    if (queryRows(db, 'PRAGMA quick_check', [], 1)[0]?.quick_check !== 'ok') throw new Error('The GeoPackage SQLite database is corrupted.');
    const schemas = {
        gpkg_contents: ['table_name', 'data_type', 'identifier', 'description', 'last_change', 'min_x', 'min_y', 'max_x', 'max_y', 'srs_id'],
        gpkg_geometry_columns: ['table_name', 'column_name', 'geometry_type_name', 'srs_id', 'z', 'm'],
        gpkg_spatial_ref_sys: ['srs_name', 'srs_id', 'organization', 'organization_coordsys_id', 'definition', 'description']
    };
    for (const [name, required] of Object.entries(schemas)) {
        requireTable(db, name);
        const columns = queryRows(db, `PRAGMA table_info(${quote(name)})`, [], 256).map(column => column.name);
        if (!required.every(column => columns.includes(column))) throw new Error(`Malformed GeoPackage metadata schema: ${name}.`);
    }
    const contents = queryRows(db, 'SELECT table_name, data_type, srs_id FROM gpkg_contents');
    const extensions = queryRows(db, "SELECT name FROM sqlite_master WHERE name='gpkg_extensions'").length
        ? (requireTable(db, 'gpkg_extensions'), queryRows(db, 'SELECT table_name, column_name, extension_name, scope FROM gpkg_extensions')) : [];
    const unsupported = [];
    const tables = [];
    for (const content of contents.filter(row => row.data_type === 'features')) {
        const name = content.table_name;
        try {
            requireTable(db, name);
            const geometryRows = queryRows(db, 'SELECT * FROM gpkg_geometry_columns WHERE table_name = ?', [name]);
            if (geometryRows.length !== 1) throw new Error('Expected exactly one geometry column.');
            const geometry = geometryRows[0];
            const type = String(geometry.geometry_type_name).toUpperCase();
            if (!TYPES.has(type)) throw new Error(`Unsupported geometry type: ${type}.`);
            if (geometry.m !== 0 || ![0, 1, 2].includes(geometry.z)) throw new Error('Measured (M) or invalid dimensional geometry is unsupported.');
            if (content.srs_id !== geometry.srs_id) throw new Error('Contents and geometry CRS metadata disagree.');
            const unsafeExtension = extensions.find(extension => (extension.table_name === name || extension.table_name == null)
                && !['gpkg_rtree_index', 'gpkg_crs_wkt', 'gpkg_metadata', 'gpkg_schema'].includes(extension.extension_name)
                && extension.scope !== 'write-only');
            if (unsafeExtension) throw new Error(`Unsupported required extension: ${unsafeExtension.extension_name}.`);
            const [srs] = queryRows(db, 'SELECT * FROM gpkg_spatial_ref_sys WHERE srs_id = ?', [geometry.srs_id]);
            if (!srs || geometry.srs_id <= 0) throw new Error('Undefined or missing source CRS. Reproject to EPSG:4326 first.');
            const definition = srs.definition_12_063 && srs.definition_12_063 !== 'undefined' ? srs.definition_12_063 : srs.definition;
            const projection = resolveSourceProjection({ organization: srs.organization, code: srs.organization_coordsys_id,
                definition, name: srs.srs_name });
            const columns = queryRows(db, `PRAGMA table_xinfo(${quote(name)})`, [], 256);
            if (columns.some(column => column.hidden !== 0)) throw new Error('Generated or hidden database columns are unsupported. Export an ordinary feature table first.');
            if (!columns.some(column => column.name === geometry.column_name)) throw new Error('The geometry column is missing.');
            if (columns.some(column => column.name !== geometry.column_name && ['geometry', '__proto__'].includes(column.name))) {
                throw new Error('An attribute uses a reserved map property (geometry or __proto__). Rename that field in a GIS before importing.');
            }
            const primaryKey = columns.filter(column => column.pk);
            if (primaryKey.length !== 1 || !/^INTEGER$/i.test(primaryKey[0].type)) throw new Error('A single INTEGER primary key is required.');
            const count = queryRows(db, `SELECT COUNT(*) AS count FROM ${quote(name)}`)[0].count;
            if (!count) throw new Error('The feature table is empty.');
            if (count > GEOPACKAGE_LIMITS.features) throw new Error('Table exceeds 50,000 features. Split it in a GIS first.');
            tables.push({ name, geometryType: type, count, srsId: geometry.srs_id, sourceCrs: projection.label,
                crsName: srs.srs_name, definition, projection,
                geometryColumn: geometry.column_name, z: geometry.z, primaryKey: primaryKey[0].name, columns });
        } catch (error) { unsupported.push({ name, reason: error.message }); }
    }
    if (!tables.length) throw new Error(`No importable vector feature tables. This release supports vector GeoPackage data only.${unsupported.length ? ' ' + unsupported.map(table => `${table.name}: ${table.reason}`).join(' ') : ''}`);
    return { tables, unsupported, rasterTables: contents.filter(row => ['tiles', '2d-gridded-coverage'].includes(row.data_type)).length };
}

function attribute(value, budget) {
    if (typeof value === 'bigint') value = value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value.toString();
    // Preserve binary data losslessly as an explicitly tagged hexadecimal string.
    if (value instanceof Uint8Array) {
        if (value.byteLength * 2 > GEOPACKAGE_LIMITS.valueBytes) throw new Error('A binary attribute exceeds the 1 MiB value limit.');
        value = 'hex:' + Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('A non-finite attribute cannot be preserved safely.');
    const bytes = typeof value === 'string' ? value.length * 2 : 8;
    budget.attributeBytes += bytes;
    if (bytes > GEOPACKAGE_LIMITS.valueBytes || budget.attributeBytes > GEOPACKAGE_LIMITS.attributeBytes) throw new Error('Attributes exceed the import memory limits (1 MiB per value, 32 MiB total).');
    return value;
}

export function readGeoPackageTables(db, inspection, names, GeometryData) {
    if (!Array.isArray(names) || !names.length || new Set(names).size !== names.length) throw new Error('Select one or more distinct vector tables.');
    const selected = names.map(name => {
        const table = inspection.tables.find(table => table.name === name);
        if (!table) throw new Error(`Table is not importable: ${name}`);
        return table;
    });
    if (selected.reduce((sum, table) => sum + table.count, 0) > GEOPACKAGE_LIMITS.features) throw new Error('Selected tables exceed 50,000 features in total. Import fewer tables.');
    const budget = { vertices: 0, maxVertices: GEOPACKAGE_LIMITS.vertices, attributeBytes: 0 };
    return selected.map(table => {
        const statement = db.prepare(`SELECT ${table.columns.map(column => quote(column.name)).join(', ')} FROM ${quote(table.name)} ORDER BY ${quote(table.primaryKey)}`);
        try {
            const features = [];
            while (statement.step()) {
                if (features.length >= GEOPACKAGE_LIMITS.features) throw new Error('Feature limit exceeded.');
                const values = statement.get(null, { useBigInt: true });
                const properties = Object.create(null);
                let geometry;
                for (let index = 0; index < table.columns.length; index++) {
                    const column = table.columns[index].name;
                    const value = values[index];
                    if (column === table.geometryColumn) {
                        if (!(value instanceof Uint8Array) || value.length < 9 || (value[3] & 0xe0)) throw new Error('Null, malformed or extended geometry.');
                        const data = new GeometryData(value);
                        if (data.empty || data.geometryError || data.srsId !== table.srsId) throw new Error('Empty, unreadable geometry or geometry CRS mismatch.');
                        if (data.geometry.hasM || (table.z === 0 && data.geometry.hasZ) || (table.z === 1 && !data.geometry.hasZ)) throw new Error('Geometry dimensions disagree with table metadata, or contain unsupported measures.');
                        geometry = data.toGeoJSON();
                        if (geometry.type.toUpperCase() !== table.geometryType) throw new Error(`Geometry ${geometry.type} disagrees with table type ${table.geometryType}.`);
                        normalizeGeometry(geometry, table.projection, budget);
                    } else properties[column] = attribute(value, budget);
                }
                if (!geometry) throw new Error('Missing feature geometry.');
                features.push({ type: 'Feature', id: properties[table.primaryKey], properties, geometry });
            }
            if (features.length !== table.count) throw new Error('Feature count changed while reading the table.');
            return { tableName: table.name, geojson: { type: 'FeatureCollection', features }, sourceCrs: table.sourceCrs,
                sourceCrsDetected: true, sourceSrsId: table.srsId, sourceCrsDefinition: table.definition,
                normalizedCrs: 'EPSG:4326', mapCrs: 'EPSG:3857' };
        } catch (error) { throw new Error(`${table.name}: ${error.message}`); }
        finally { statement.free(); }
    });
}
