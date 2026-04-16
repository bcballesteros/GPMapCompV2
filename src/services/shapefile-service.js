import shp from 'shpjs';
import { geojsonToOpenLayers } from '../utils/geo.js';

export async function readShapefile(file) {
    const arrayBuffer = await file.arrayBuffer();
    return shp(arrayBuffer);
}

export async function readGeoJSON(file) {
    const text = await file.text();
    return JSON.parse(text);
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
    const raw = layerData.type === 'shapefile'
        ? await readShapefile(layerData.file)
        : await readGeoJSON(layerData.file);

    const geojson = normalizeGeojson(raw);

    return {
        geojson,
        features: geojsonToOpenLayers(geojson)
    };
}
