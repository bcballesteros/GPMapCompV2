import initSql from 'rtree-sql.js';
import wkx from 'wkx';
import geometryModule from '@ngageoint/geopackage/dist/lib/geom/geometryData.js';
import { readFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';

export const { GeometryData } = geometryModule;
const SQL = await initSql({ wasmBinary: await readFile(new URL('../../node_modules/@ngageoint/geopackage/dist/sql-wasm.wasm', import.meta.url)) });
const quote = value => `"${String(value).replaceAll('"', '""')}"`;
export const point = { type: 'Point', coordinates: [121, 14] };
export const line = { type: 'LineString', coordinates: [[120, 13], [121, 14]] };
export const polygon = { type: 'Polygon', coordinates: [[[120, 13], [121, 13], [121, 14], [120, 13]], [[120.2, 13.1], [120.4, 13.1], [120.4, 13.2], [120.2, 13.1]]] };
const WGS84_WKT = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]';

export function makeGeoPackage(tables = [{ name: 'facilities', geometry: point }], options = {}) {
    const db = new SQL.Database();
    db.run(`PRAGMA application_id=1196444487;
        PRAGMA user_version=10300;
        CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
        CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT '2026-01-01T00:00:00.000Z', min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER);
        CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT, geometry_type_name TEXT, srs_id INTEGER, z INTEGER, m INTEGER, PRIMARY KEY(table_name, column_name));`);
    for (const [id, name, definition] of [[-1, 'Undefined Cartesian', 'undefined'], [0, 'Undefined geographic', 'undefined'], [4326, 'WGS 84', 'undefined'], [3857, 'WGS 84 / Pseudo-Mercator', 'undefined'], [32651, 'WGS 84 / UTM zone 51N', 'undefined'], [99999, 'Unknown', 'undefined']]) {
        if (id > 0 && id !== 4326 && !tables.some(table => table.srsId === id)) continue;
        db.run('INSERT INTO gpkg_spatial_ref_sys VALUES (?, ?, ?, ?, ?, NULL)', [name, id, id <= 0 ? 'NONE' : 'EPSG', id, id === 4326 ? WGS84_WKT : definition]);
    }
    for (const table of tables) {
        const srsId = table.srsId ?? 4326;
        const geometry = table.geometry || point;
        db.run('INSERT INTO gpkg_contents (table_name, data_type, srs_id) VALUES (?, ?, ?)', [table.name, table.dataType || 'features', srsId]);
        if (table.dataType === 'tiles') {
            db.run(`CREATE TABLE ${quote(table.name)} (id INTEGER PRIMARY KEY, zoom_level INTEGER NOT NULL, tile_column INTEGER NOT NULL, tile_row INTEGER NOT NULL, tile_data BLOB NOT NULL, UNIQUE (zoom_level, tile_column, tile_row));
                CREATE TABLE IF NOT EXISTS gpkg_tile_matrix_set (table_name TEXT PRIMARY KEY, srs_id INTEGER NOT NULL, min_x DOUBLE NOT NULL, min_y DOUBLE NOT NULL, max_x DOUBLE NOT NULL, max_y DOUBLE NOT NULL);
                CREATE TABLE IF NOT EXISTS gpkg_tile_matrix (table_name TEXT, zoom_level INTEGER, matrix_width INTEGER, matrix_height INTEGER, tile_width INTEGER, tile_height INTEGER, pixel_x_size DOUBLE, pixel_y_size DOUBLE, PRIMARY KEY (table_name, zoom_level));`);
            db.run('INSERT INTO gpkg_tile_matrix_set VALUES (?, ?, -180, -90, 180, 90)', [table.name, srsId]);
            continue;
        }
        db.run('INSERT INTO gpkg_geometry_columns VALUES (?, ?, ?, ?, ?, ?)', [table.name, 'geom', table.type || geometry.type.toUpperCase(), srsId, table.z || 0, table.m || 0]);
        db.run(`CREATE TABLE ${quote(table.name)} (id INTEGER PRIMARY KEY, geom BLOB, name TEXT, category TEXT, value REAL, flag BOOLEAN, nullable TEXT, observed DATETIME, binary BLOB, large INTEGER)`);
        const data = new GeometryData();
        data.setSrsId(table.geometrySrsId ?? srsId);
        data.setGeometry(wkx.Geometry.parseGeoJSON(geometry));
        const blob = table.nullGeometry ? null : table.corruptGeometry ? new Uint8Array([1, 2, 3]) : new Uint8Array(data.toData());
        for (let index = 0; index < (table.count ?? 1); index++) {
            db.run(`INSERT INTO ${quote(table.name)} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS INTEGER))`,
                [index + 1, blob, table.attributeName || '<img src=x onerror=alert(1)>', 'A', 42.25, 1, null, '2026-01-02T03:04:05Z', new Uint8Array([0, 255, 10]), '9007199254740993']);
        }
    }
    options.mutate?.(db);
    const bytes = db.export();
    db.close();
    return bytes;
}

export function openFixture(bytes) { return new SQL.Database(bytes); }

export function makePointShapefileZip() {
    const bytes = new Uint8Array(128);
    const view = new DataView(bytes.buffer);
    view.setInt32(0, 9994); view.setInt32(24, 64);
    view.setInt32(28, 1000, true); view.setInt32(32, 1, true);
    [121, 14, 121, 14].forEach((value, index) => view.setFloat64(36 + index * 8, value, true));
    view.setInt32(100, 1); view.setInt32(104, 10);
    view.setInt32(108, 1, true); view.setFloat64(112, 121, true); view.setFloat64(120, 14, true);
    return zipSync({ 'sample.shp': bytes, 'sample.prj': strToU8('GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]') });
}
