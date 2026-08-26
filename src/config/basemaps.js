import ol from '../lib/ol.js';

const NAMRIA_ATTRIBUTION = '\u00A9 NAMRIA';
const ESRI_ATTRIBUTION = '\u00A9 Esri';

export function createBasemapSource(name) {
    switch (name) {
        case 'osm':
            return new ol.source.OSM({
                crossOrigin: 'anonymous',
                transition: 0
            });
        case 'google':
            return new ol.source.XYZ({
                url: 'https://mt{0-3}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                crossOrigin: 'anonymous',
                transition: 0
            });
        case 'bing':
            return new ol.source.XYZ({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
                crossOrigin: 'anonymous',
                transition: 0
            });
        case 'arcgis-aerial':
            return new ol.source.XYZ({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attributions: ESRI_ATTRIBUTION,
                crossOrigin: 'anonymous',
                transition: 0
            });
        case 'namria-orthoimage-2011':
            return new ol.source.XYZ({
                url: 'https://basemapserver.geoportal.gov.ph/tiles/v2/Orthoimage/{z}/{x}/{y}.png',
                attributions: NAMRIA_ATTRIBUTION,
                crossOrigin: 'anonymous',
                transition: 0
            });
        case 'namria-orthoimage-2013-2014':
            return new ol.source.XYZ({
                url: 'https://basemapserver.geoportal.gov.ph/tiles/v2/Ortho_Image_Yolanda/{z}/{x}/{y}.png',
                attributions: NAMRIA_ATTRIBUTION,
                crossOrigin: 'anonymous',
                transition: 0
            });
        case 'namria-orthorectified-radar':
            return new ol.source.XYZ({
                url: 'https://basemapserver.geoportal.gov.ph/tiles/v2/NAMRIA_ORI/{z}/{x}/{y}.png',
                attributions: NAMRIA_ATTRIBUTION,
                crossOrigin: 'anonymous',
                transition: 0
            });
        case 'namria':
        default:
            return new ol.source.XYZ({
                url: 'https://basemapserver.geoportal.gov.ph/tiles/v2/PGP/{z}/{x}/{y}.png',
                attributions: NAMRIA_ATTRIBUTION,
                crossOrigin: 'anonymous',
                transition: 0
            });
    }
}

export function createBasemapLayer(name = 'namria') {
    return new ol.layer.Tile({
        source: createBasemapSource(name),
        properties: {
            basemapId: name,
            name: `basemap-${name}`
        }
    });
}
