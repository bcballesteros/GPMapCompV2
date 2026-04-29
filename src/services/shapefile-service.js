import shp from 'shpjs';
import { iter } from 'but-unzip';
import ol from '../lib/ol.js';
import { geojsonToOpenLayers } from '../utils/geo.js';

export async function readShapefile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const sourceCrs = await detectShapefileZipCrs(arrayBuffer);
    const raw = await shp(arrayBuffer);

    return { raw, sourceCrs };
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

function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))];
}

function readZipTextEntries(arrayBuffer, extension) {
    const decoder = new TextDecoder();
    const entries = [];

    for (const entry of iter(new Uint8Array(arrayBuffer))) {
        if (!entry.filename.toLowerCase().endsWith(extension)) {
            continue;
        }

        entries.push(Promise.resolve(entry.read()).then((bytes) => ({
            filename: entry.filename,
            text: decoder.decode(bytes)
        })));
    }

    return Promise.all(entries);
}

function normalizeCrsText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function parseCrsFromText(value) {
    const text = normalizeCrsText(value);
    if (!text) {
        return null;
    }

    if (/PRS[_\s-]*1992|Philippine Reference System 1992/i.test(text)) {
        const epsgMatch = text.match(/AUTHORITY\s*\[\s*["']EPSG["']\s*,\s*["']?(\d+)["']?\s*\]/i)
            || text.match(/EPSG[:"'\s,]+(\d{3,6})/i);
        return epsgMatch ? `PRS92 (EPSG:${epsgMatch[1]})` : 'PRS92';
    }

    const authorityMatch = text.match(/AUTHORITY\s*\[\s*["']EPSG["']\s*,\s*["']?(\d+)["']?\s*\]/i);
    if (authorityMatch) {
        return `EPSG:${authorityMatch[1]}`;
    }

    const epsgMatch = text.match(/EPSG[:"'\s,]+(\d{3,6})/i);
    if (epsgMatch) {
        return `EPSG:${epsgMatch[1]}`;
    }

    const nameMatch = text.match(/^(?:GEOGCS|PROJCS)\s*\[\s*["']([^"']+)["']/i);
    return nameMatch ? nameMatch[1] : null;
}

function buildCrsMetadata(crsValues, fallback = 'Unknown CRS') {
    const uniqueCrs = uniqueValues(crsValues);

    if (uniqueCrs.length === 1) {
        return {
            sourceCrs: uniqueCrs[0],
            sourceCrsDetected: uniqueCrs[0] !== 'Unknown CRS'
        };
    }

    if (uniqueCrs.length > 1) {
        return {
            sourceCrs: `Multiple CRS (${uniqueCrs.join(', ')})`,
            sourceCrsDetected: true
        };
    }

    return {
        sourceCrs: fallback,
        sourceCrsDetected: fallback !== 'Unknown CRS'
    };
}

async function detectShapefileZipCrs(arrayBuffer) {
    const prjEntries = await readZipTextEntries(arrayBuffer, '.prj');
    return buildCrsMetadata(prjEntries.map((entry) => parseCrsFromText(entry.text)));
}

function detectGeojsonCrs(geojson) {
    const crs = geojson?.crs;
    const crsText = crs?.properties?.name || crs?.properties?.href || crs?.name || '';
    const parsedCrs = parseCrsFromText(crsText);

    return {
        sourceCrs: parsedCrs || 'EPSG:4326',
        sourceCrsDetected: Boolean(parsedCrs) || geojson?.type === 'FeatureCollection' || geojson?.type === 'Feature'
    };
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
    let sourceCrsMetadata;
    switch (layerData.type) {
    case 'shapefile':
        ({ raw, sourceCrs: sourceCrsMetadata } = await readShapefile(layerData.file));
        break;
    case 'geojson':
        raw = await readGeoJSON(layerData.file);
        sourceCrsMetadata = detectGeojsonCrs(raw);
        break;
    case 'kml':
        raw = await readKml(layerData.file);
        sourceCrsMetadata = { sourceCrs: 'EPSG:4326', sourceCrsDetected: true };
        break;
    case 'csv':
        raw = await readCsv(layerData.file);
        sourceCrsMetadata = { sourceCrs: 'EPSG:4326', sourceCrsDetected: true };
        break;
    default:
        throw new Error(`Unsupported upload type: ${layerData.type}`);
    }

    const geojson = normalizeGeojson(raw);

    return {
        geojson,
        features: geojsonToOpenLayers(geojson),
        sourceCrs: sourceCrsMetadata?.sourceCrs || 'Unknown CRS',
        sourceCrsDetected: Boolean(sourceCrsMetadata?.sourceCrsDetected)
    };
}
