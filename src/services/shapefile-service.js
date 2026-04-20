import shp from 'shpjs';
import ol from '../lib/ol.js';
import { geojsonToOpenLayers } from '../utils/geo.js';

export async function readShapefile(file) {
    const arrayBuffer = await file.arrayBuffer();
    return shp(arrayBuffer);
}

export async function readGeoJSON(file) {
    const text = await file.text();
    return JSON.parse(text);
}

export async function readKml(file) {
    const text = await file.text();
    const format = new ol.format.KML();
    const features = format.readFeatures(text, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
    });

    return new ol.format.GeoJSON().writeFeaturesObject(features, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
    });
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const nextChar = line[index + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current.trim());
    return values;
}

function getCoordinateHeader(headers, aliases) {
    return headers.find((header) => aliases.includes(header.trim().toLowerCase())) || null;
}

export async function readCsv(file) {
    const text = await file.text();
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length < 2) {
        throw new Error('CSV must include a header row and at least one data row');
    }

    const headers = parseCsvLine(lines[0]);
    const latitudeHeader = getCoordinateHeader(headers, ['latitude', 'lat', 'y', 'ycoord', 'y_coord']);
    const longitudeHeader = getCoordinateHeader(headers, ['longitude', 'lon', 'lng', 'long', 'x', 'xcoord', 'x_coord']);

    if (!latitudeHeader || !longitudeHeader) {
        throw new Error('CSV must include latitude/longitude columns');
    }

    const latitudeIndex = headers.indexOf(latitudeHeader);
    const longitudeIndex = headers.indexOf(longitudeHeader);
    const features = lines.slice(1).flatMap((line) => {
        const values = parseCsvLine(line);
        const latitude = Number(values[latitudeIndex]);
        const longitude = Number(values[longitudeIndex]);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return [];
        }

        const properties = headers.reduce((result, header, index) => {
            result[header] = values[index] ?? '';
            return result;
        }, {});

        return [{
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [longitude, latitude]
            },
            properties
        }];
    });

    return {
        type: 'FeatureCollection',
        features
    };
}

/**
 * shpjs can return either a single FeatureCollection or an array of them
 * (one per .shp file inside the zip). Normalize to a single FeatureCollection
 * so the rest of the app always works with one consistent shape.
 */
function normalizeGeojson(raw) {
    if (Array.isArray(raw)) {
        // Merge all FeatureCollections into one
        const allFeatures = raw.flatMap((fc) => (fc?.features ?? []));
        return { type: 'FeatureCollection', features: allFeatures };
    }
    // Already a FeatureCollection
    return raw;
}

export async function parseUploadFile(layerData) {
    let raw;
    switch (layerData.type) {
    case 'shapefile':
        raw = await readShapefile(layerData.file);
        break;
    case 'geojson':
        raw = await readGeoJSON(layerData.file);
        break;
    case 'kml':
        raw = await readKml(layerData.file);
        break;
    case 'csv':
        raw = await readCsv(layerData.file);
        break;
    default:
        throw new Error(`Unsupported upload type: ${layerData.type}`);
    }

    const geojson = normalizeGeojson(raw);

    return {
        geojson,
        features: geojsonToOpenLayers(geojson)
    };
}
