export async function processShapefile(file) {
    const arrayBuffer = await file.arrayBuffer();
    return shp(arrayBuffer);
}

export async function processGeoJSON(file) {
    const text = await file.text();
    return JSON.parse(text);
}

export function geojsonToOpenLayers(geojson) {
    const features = [];

    if (!geojson || !geojson.features) {
        return features;
    }

    const formatFactory = new ol.format.GeoJSON();

    geojson.features.forEach((feature) => {
        try {
            const olFeature = formatFactory.readFeature(feature, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            });
            features.push(olFeature);
        } catch (error) {
            console.warn('Could not convert feature:', error);
        }
    });

    return features;
}
