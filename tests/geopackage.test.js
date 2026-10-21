import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectGeoPackage, readGeoPackageTables, validateGeoPackageFile, validateGeoPackageHeader, GEOPACKAGE_LIMITS } from '../src/services/geopackage-reader.js';
import { geojsonProjection, normalizeGeometry, resolveSourceProjection } from '../src/services/vector-crs.js';
import { geojsonToOpenLayers } from '../src/utils/geo.js';
import { parseUploadFile } from '../src/services/shapefile-service.js';
import { GeometryData, makeGeoPackage, makePointShapefileZip, openFixture, point, line, polygon } from './helpers/geopackage-fixture.js';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`);
function read(tables, names, options) {
    const bytes = makeGeoPackage(tables, options);
    validateGeoPackageHeader(bytes);
    const db = openFixture(bytes);
    try {
        const inspection = inspectGeoPackage(db);
        return { inspection, layers: readGeoPackageTables(db, inspection, names || inspection.tables.map(table => table.name), GeometryData) };
    } finally { db.close(); }
}

test('real serialized GeoPackages preserve all six vector types, holes, attributes and separate identities', () => {
    const geometries = [point, line, polygon,
        { type: 'MultiPoint', coordinates: [[120, 13], [121, 14]] },
        { type: 'MultiLineString', coordinates: [line.coordinates, [[122, 14], [123, 15]]] },
        { type: 'MultiPolygon', coordinates: [polygon.coordinates] }];
    const { inspection, layers } = read(geometries.map((geometry, index) => ({ name: `table_${index}`, geometry })));
    assert.equal(inspection.tables.length, 6);
    layers.forEach((layer, index) => {
        assert.deepEqual(layer.geojson.features[0].geometry, geometries[index]);
        const properties = layer.geojson.features[0].properties;
        assert.equal(properties.large, '9007199254740993');
        assert.equal(properties.binary, 'hex:00ff0a');
        assert.equal(properties.observed, '2026-01-02T03:04:05Z');
        assert.equal(properties.flag, 1);
        assert.equal(properties.value, 42.25);
        assert.equal(properties.nullable, null);
        assert.match(properties.name, /<img/);
        assert.equal(layer.geojson.features[0].id, 1);
        const features = geojsonToOpenLayers(layer.geojson);
        assert.equal(features.length, 1);
        assert.equal(features[0].get('large'), '9007199254740993');
        assert.ok(features[0].getGeometry().getExtent()[0] > 13000000);
    });
});

test('only selected tables are read; identifiers are quoted and selection is validated', () => {
    const hostile = 'roads"; DROP TABLE gpkg_contents; --';
    const { layers } = read([{ name: hostile, geometry: line }, { name: 'facilities', geometry: point }], [hostile]);
    assert.equal(layers.length, 1);
    assert.equal(layers[0].tableName, hostile);
    assert.throws(() => read(undefined, []), /Select one or more/);
    assert.throws(() => read(undefined, ['missing']), /not importable/);
    assert.throws(() => read(undefined, ['facilities', 'facilities']), /distinct/);
});

test('discovery distinguishes supported vectors, tiles, empty tables, unsupported types and unknown CRS', () => {
    const { inspection } = read([
        { name: 'valid' }, { name: 'empty', count: 0 }, { name: 'raster', dataType: 'tiles' },
        { name: 'curve', type: 'CIRCULARSTRING' }, { name: 'unknown', srsId: 99999 }, { name: 'measured', m: 1 }
    ]);
    assert.deepEqual(inspection.tables.map(table => table.name), ['valid']);
    assert.equal(inspection.rasterTables, 1);
    assert.equal(inspection.unsupported.length, 4);
    assert.throws(() => read([{ name: 'tiles', dataType: 'tiles' }]), /vector GeoPackage data only/);
    assert.throws(() => read([{ name: 'empty', count: 0 }]), /empty/);
    assert.throws(() => read([{ name: 'unknown', srsId: 99999 }]), /no reliable/);
});

test('WGS84, Web Mercator and WGS84 UTM coordinates normalize to independently known positions', () => {
    const { layers } = read([
        { name: 'wgs84', geometry: point },
        { name: 'mercator', srsId: 3857, geometry: { type: 'MultiPoint', coordinates: [[13469658.385986103, 1574216.548161465], [13358338.895192828, 1459732.2718804977]] } },
        { name: 'utm51', srsId: 32651, geometry: { type: 'Point', coordinates: [500000, 0] } }
    ]);
    assert.deepEqual(layers[0].geojson.features[0].geometry.coordinates, [121, 14]);
    const coordinates = layers[1].geojson.features[0].geometry.coordinates;
    close(coordinates[0][0], 121); close(coordinates[0][1], 14);
    close(coordinates[1][0], 120); close(coordinates[1][1], 13);
    close(layers[2].geojson.features[0].geometry.coordinates[0], 123);
    close(layers[2].geojson.features[0].geometry.coordinates[1], 0);
    const feature = geojsonToOpenLayers(layers[1].geojson)[0];
    const extent = feature.getGeometry().getExtent();
    [13358338.895192828, 1459732.2718804977, 13469658.385986103, 1574216.548161465].forEach((expected, index) => close(extent[index], expected, 1e-6));
    assert.equal(layers[1].sourceCrs, 'EPSG:3857');
    assert.equal(layers[1].normalizedCrs, 'EPSG:4326');
});

test('projected line and polygon transformations preserve ring and multipart structure', () => {
    const a = [13358338.895192828, 1459732.2718804977];
    const b = [13469658.385986103, 1574216.548161465];
    const { layers } = read([
        { name: 'line', srsId: 3857, geometry: { type: 'MultiLineString', coordinates: [[a, b]] } },
        { name: 'polygon', srsId: 3857, geometry: { type: 'MultiPolygon', coordinates: [[[a, [b[0], a[1]], b, a]]] } }
    ]);
    close(layers[0].geojson.features[0].geometry.coordinates[0][1][1], 14);
    close(layers[1].geojson.features[0].geometry.coordinates[0][0][2][0], 121);
});

test('null, corrupted, mismatched and out-of-map geometries reject the entire selected batch and release statements', () => {
    for (const bad of [{ nullGeometry: true }, { corruptGeometry: true }, { geometrySrsId: 3857 }, { type: 'LINESTRING' }, { geometry: { type: 'Point', coordinates: [999, 999] } }]) {
        assert.throws(() => read([{ name: 'good' }, { name: 'bad', ...bad }]), /bad:/);
    }
    const db = openFixture(makeGeoPackage([{ name: 'bad', nullGeometry: true }]));
    const inspection = inspectGeoPackage(db);
    assert.throws(() => readGeoPackageTables(db, inspection, ['bad'], GeometryData), /bad:/);
    assert.equal(db.exec('SELECT COUNT(*) FROM bad')[0].values[0][0], 1);
    db.close(); // sql.js would reject leaked statements on database closure in some runtimes.
    assert.equal(read().layers.length, 1);
});

test('file validation, SQLite corruption, structure checks and geometry/resource limits', () => {
    assert.throws(() => validateGeoPackageFile({ name: 'data.gpkg', size: 0 }), /empty/);
    assert.throws(() => validateGeoPackageFile({ name: 'data.zip', size: 100 }), /\.gpkg/);
    assert.throws(() => validateGeoPackageFile({ name: 'data.gpkg', size: GEOPACKAGE_LIMITS.bytes + 1 }), /50 MiB/);
    assert.throws(() => validateGeoPackageHeader(new Uint8Array(100)), /SQLite/);
    const bytes = makeGeoPackage(); bytes[68] = 0;
    assert.throws(() => validateGeoPackageHeader(bytes), /identifier/);
    const corrupt = makeGeoPackage(); corrupt.fill(255, 100, 200);
    assert.throws(() => { const db = openFixture(corrupt); try { inspectGeoPackage(db); } finally { db.close(); } });
    assert.throws(() => read(undefined, undefined, { mutate: db => db.run('DROP TABLE gpkg_geometry_columns') }), /missing physical table/);
    assert.throws(() => read(undefined, undefined, { mutate: db => db.run('ALTER TABLE gpkg_contents DROP COLUMN last_change') }), /Malformed GeoPackage metadata schema/);
    assert.throws(() => read([{ name: 'facilities' }], undefined, { mutate: db => db.run("UPDATE gpkg_contents SET srs_id=3857") }), /CRS metadata disagree/);
    assert.throws(() => read(undefined, undefined, { mutate: db => db.run('ALTER TABLE facilities ADD COLUMN computed TEXT GENERATED ALWAYS AS (name) VIRTUAL') }), /Generated or hidden/);
    assert.throws(() => read(undefined, undefined, { mutate: db => db.run('ALTER TABLE facilities RENAME TO actual; CREATE VIEW facilities AS SELECT * FROM actual') }), /physical table/);
    assert.throws(() => read(undefined, undefined, { mutate: db => db.run("CREATE TABLE gpkg_extensions (table_name TEXT, column_name TEXT, extension_name TEXT, scope TEXT); INSERT INTO gpkg_extensions VALUES ('facilities', 'geom', 'vendor_geometry', 'read-write')") }), /Unsupported required extension/);
    const projection = resolveSourceProjection({ organization: 'EPSG', code: 4326 });
    assert.throws(() => normalizeGeometry(structuredClone(line), projection, { vertices: 0, maxVertices: 1 }), /coordinate positions/);
    assert.throws(() => normalizeGeometry({ type: 'Polygon', coordinates: [[[120, 13], [121, 14], [122, 15], [123, 16]]] }, projection), /closed/);
});

test('actual feature and attribute limits reject oversized tables before returning partial data', () => {
    assert.throws(() => read([{ name: 'too_many', count: 50001 }]), /50,000 features/);
    assert.throws(() => read([{ name: 'huge_text', attributeName: 'x'.repeat(524289) }]), /1 MiB/);
});

test('GeoJSON WGS84 and explicitly declared supported CRS normalize correctly; unsupported declarations reject', async () => {
    for (const crsName of ['EPSG:3857', 'urn:ogc:def:crs:EPSG::3857', 'http://www.opengis.net/def/crs/EPSG/0/3857']) {
        const raw = { type: 'FeatureCollection', crs: { type: 'name', properties: { name: crsName } }, features: [{ type: 'Feature', properties: { name: 'sample' }, geometry: { type: 'Point', coordinates: [13469658.385986103, 1574216.548161465] } }] };
        const parsed = await parseUploadFile({ type: 'geojson', file: new File([JSON.stringify(raw)], 'data.geojson') });
        close(parsed.geojson.features[0].geometry.coordinates[0], 121);
        close(parsed.geojson.features[0].geometry.coordinates[1], 14);
        assert.equal(parsed.sourceCrs, 'EPSG:3857');
        close(parsed.features[0].getGeometry().getCoordinates()[0], 13469658.385986103, 1e-6);
    }
    assert.throws(() => geojsonProjection({ properties: { name: 'EPSG:99999' } }), /no reliable/);
    assert.throws(() => geojsonProjection({ properties: { name: 'unrecognized' } }), /unsupported/);
    const parsed = await parseUploadFile({ type: 'geojson', file: new File([JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: point, properties: {} }] })], 'normal.json') });
    assert.deepEqual(parsed.geojson.features[0].geometry, point);
    const csv = await parseUploadFile({ type: 'csv', file: new File(['name,latitude,longitude\nManila,14,121'], 'normal.csv') });
    assert.deepEqual(csv.geojson.features[0].geometry, point);
    const shapefile = await parseUploadFile({ type: 'shapefile', file: new File([makePointShapefileZip()], 'point.zip') });
    assert.deepEqual(shapefile.geojson.features[0].geometry, point);
});

test('supported file WKT transforms a custom CRS; unknown datum parameters are never guessed', () => {
    const wkt = 'PROJCS["WGS 84 / UTM zone 51N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",123],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1]]';
    const { layers } = read([{ name: 'custom', srsId: 99999, geometry: { type: 'Point', coordinates: [500000, 0] } }], undefined,
        { mutate: db => db.run('UPDATE gpkg_spatial_ref_sys SET definition=? WHERE srs_id=99999', [wkt]) });
    close(layers[0].geojson.features[0].geometry.coordinates[0], 123);
    close(layers[0].geojson.features[0].geometry.coordinates[1], 0);
    assert.equal(layers[0].sourceCrsDefinition, wkt);
    assert.throws(() => resolveSourceProjection({ organization: 'EPSG', code: 3123, definition: wkt.replace('WGS_1984', 'Philippine_Reference_System_1992') }), /no reliable/);
});

test('Z is preserved; reserved OpenLayers attribute names and dimension mismatches reject explicitly', () => {
    const geometry = { type: 'Point', coordinates: [121, 14, 50] };
    assert.deepEqual(read([{ name: 'altitude', geometry, z: 1 }]).layers[0].geojson.features[0].geometry, geometry);
    assert.throws(() => read([{ name: 'altitude', geometry, z: 0 }]), /dimensions disagree/);
    for (const field of ['geometry', '__proto__']) {
        assert.throws(() => read(undefined, undefined, { mutate: db => db.run(`ALTER TABLE facilities ADD COLUMN "${field}" TEXT`) }), /reserved map property/);
    }
});

test('50,000 serialized points import at the inclusive feature boundary', t => {
    const bytes = makeGeoPackage([{ name: 'boundary', count: 50000 }]);
    const db = openFixture(bytes);
    const start = performance.now();
    try {
        const inspection = inspectGeoPackage(db);
        const [layer] = readGeoPackageTables(db, inspection, ['boundary'], GeometryData);
        assert.equal(layer.geojson.features.length, 50000);
        assert.equal(layer.geojson.features.at(-1).id, 50000);
        const features = geojsonToOpenLayers(layer.geojson);
        assert.equal(features.length, 50000);
        t.diagnostic(JSON.stringify({ fileBytes: bytes.length, features: features.length, readAndConvertMs: Math.round(performance.now() - start) }));
    } finally { db.close(); }
});
