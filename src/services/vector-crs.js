import proj4 from 'proj4';

export function resolveSourceProjection({ organization, code, definition, name } = {}) {
    const authority = String(organization || '').toUpperCase();
    const id = Number(code);
    const label = authority === 'EPSG' ? `EPSG:${id}` : (name || 'Unknown CRS');
    let source;
    if (authority === 'EPSG' && [4326, 3857].includes(id)) source = `EPSG:${id}`;
    // WGS84 UTM has fully specified, unambiguous parameters.
    if (authority === 'EPSG' && ((id >= 32601 && id <= 32660) || (id >= 32701 && id <= 32760))) {
        source = `+proj=utm +zone=${id % 100} ${id >= 32700 ? '+south' : ''} +datum=WGS84 +units=m +no_defs`;
    }
    if (!source && definition && !/^undefined$/i.test(definition.trim())) {
        // Do not let proj4 silently use an identity datum shift for an unknown datum.
        const wgs84 = /(?:DATUM|ENSEMBLE)\s*\[\s*"(?:WGS_?1984|WGS_?84|World Geodetic System 1984)/i.test(definition)
            || /\+datum=WGS84\b/i.test(definition);
        const explicitShift = /TOWGS84\s*\[|\+towgs84=/i.test(definition);
        if ((wgs84 || explicitShift) && !/EXTENSION\s*\[\s*"PROJ4_GRIDS"|\+nadgrids=|BOUNDCRS\s*\[/i.test(definition)) source = definition;
    }
    if (!source) throw new Error(`${label}: no reliable coordinate transformation is available. Reproject this table to EPSG:4326 in a GIS first (include datum transformation parameters for PRS92).`);
    try {
        const transform = proj4(source, 'EPSG:4326');
        return { label, transform: source === 'EPSG:4326' ? coordinate => coordinate.slice() : coordinate => transform.forward(coordinate) };
    } catch {
        throw new Error(`${label}: the CRS definition is unsupported. Reproject to EPSG:4326 in a GIS first.`);
    }
}

export function geojsonProjection(crs) {
    if (!crs) return resolveSourceProjection({ organization: 'EPSG', code: 4326 });
    const value = crs.properties?.name || crs.properties?.href || crs.name || '';
    if (/(?:CRS:?84|CRS84)$/i.test(value)) return resolveSourceProjection({ organization: 'EPSG', code: 4326 });
    const match = value.match(/EPSG(?::|\/|::|:\/\/).*?(\d+)\/?$/i);
    if (!match) throw new Error('The declared GeoJSON CRS is unsupported. Reproject to EPSG:4326 first.');
    return resolveSourceProjection({ organization: 'EPSG', code: Number(match[1]) });
}

const DEPTH = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };

/** Mutates the newly read geometry; preserves Z, multipart structure and ring order. */
export function normalizeGeometry(geometry, projection, budget = { vertices: 0, maxVertices: Infinity }) {
    if (!geometry || !Object.hasOwn(DEPTH, geometry.type)) throw new Error('Null, empty or unsupported geometry; the entire table was rejected.');
    function visit(coordinates, depth) {
        if (!Array.isArray(coordinates) || !coordinates.length) throw new Error('Empty or malformed geometry coordinates.');
        if (depth > 0) return coordinates.map(child => visit(child, depth - 1));
        if (coordinates.length < 2 || coordinates.length > 3 || !coordinates.every(Number.isFinite)) throw new Error('Invalid geometry coordinate.');
        if (++budget.vertices > budget.maxVertices) throw new Error(`Import exceeds ${budget.maxVertices.toLocaleString()} coordinate positions. Split the dataset first.`);
        const result = projection.transform(coordinates.slice(0, 2));
        if (!result.every(Number.isFinite) || Math.abs(result[0]) > 180.0000001 || Math.abs(result[1]) > 85.05112878) {
            throw new Error('Coordinates fall outside the supported Web Mercator map area. Check the source CRS.');
        }
        return coordinates.length === 3 ? [...result, coordinates[2]] : result;
    }
    geometry.coordinates = visit(geometry.coordinates, DEPTH[geometry.type]);
    const checkLine = line => { if (line.length < 2) throw new Error('A line needs at least two positions.'); };
    const checkPolygon = polygon => polygon.forEach(ring => {
        if (ring.length < 4 || ring[0].some((value, index) => value !== ring.at(-1)[index])) throw new Error('A polygon ring must be closed and contain at least four positions.');
    });
    if (geometry.type === 'LineString') checkLine(geometry.coordinates);
    if (geometry.type === 'MultiLineString') geometry.coordinates.forEach(checkLine);
    if (geometry.type === 'Polygon') checkPolygon(geometry.coordinates);
    if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(checkPolygon);
    return geometry;
}

export function normalizeDeclaredGeojson(geojson) {
    const projection = geojsonProjection(geojson?.crs);
    // Standard RFC 7946 files retain their existing conversion behavior.
    if (geojson.crs) {
        const convert = geometry => {
            if (geometry?.type === 'GeometryCollection') geometry.geometries.forEach(convert);
            else if (geometry) normalizeGeometry(geometry, projection);
        };
        if (geojson.type === 'FeatureCollection') geojson.features.forEach(feature => { convert(feature.geometry); delete feature.bbox; });
        else if (geojson.type === 'Feature') convert(geojson.geometry);
        else convert(geojson);
        delete geojson.crs;
        delete geojson.bbox;
    }
    return projection.label;
}
