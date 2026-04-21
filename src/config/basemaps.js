import ol from '../lib/ol.js';

const NAMRIA_ATTRIBUTION = '\u00A9 NAMRIA';
const ESRI_ATTRIBUTION = '\u00A9 Esri';

export function createBasemapSource(name) {
    switch (name) {
        case 'osm':
            return new ol.source.OSM({
                crossOrigin: 'anonymous'
            });
        case 'google':
            return new ol.source.XYZ({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attributions: ESRI_ATTRIBUTION,
                crossOrigin: 'anonymous'
            });
        case 'bing':
            return new ol.source.XYZ({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
                crossOrigin: 'anonymous'
            });
        case 'namria':
        default:
            return new ol.source.XYZ({
                url: 'https://basemapserver.geoportal.gov.ph/tiles/v2/PGP/{z}/{x}/{y}.png',
                attributions: NAMRIA_ATTRIBUTION,
                crossOrigin: 'anonymous'
            });
    }
}

export function createBasemapLayer(name = 'namria') {
    return new ol.layer.Tile({
        source: createBasemapSource(name)
    });
}
