import { geojsonToOpenLayers } from '../utils/geo.js';

export async function readShapefile(file) {
    const arrayBuffer = await file.arrayBuffer();
    return shp(arrayBuffer);
}

export async function readGeoJSON(file) {
    const text = await file.text();
    return JSON.parse(text);
}

export async function parseUploadFile(layerData) {
    const geojson = layerData.type === 'shapefile'
        ? await readShapefile(layerData.file)
        : await readGeoJSON(layerData.file);

    return {
        geojson,
        features: geojsonToOpenLayers(geojson)
    };
}
