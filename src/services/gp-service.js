import ol from '../lib/ol.js';
import { createWmsLayerConfig } from './wms-service.js';

export const DEFAULT_GP_URL = 'https://geoportal.gov.ph/';

const DEMO_TILE_URL = 'https://basemapserver.geoportal.gov.ph/tiles/v2/PGP/{z}/{x}/{y}.png';

export const DEMO_GP_LAYERS = [
    {
        name: 'administrative-boundaries',
        title: 'Administrative Boundaries',
        type: 'xyz',
        tileUrl: DEMO_TILE_URL
    },
    {
        name: 'roads-network',
        title: 'Roads Network',
        type: 'xyz',
        tileUrl: DEMO_TILE_URL
    },
    {
        name: 'hydrography',
        title: 'Hydrography',
        type: 'xyz',
        tileUrl: DEMO_TILE_URL
    },
    {
        name: 'land-cover',
        title: 'Land Cover',
        type: 'xyz',
        tileUrl: DEMO_TILE_URL
    },
    {
        name: 'topographic-map',
        title: 'Topographic Map',
        type: 'xyz',
        tileUrl: DEMO_TILE_URL
    }
];

export function createGpLayerConfig(gpUrl, layerInfo) {
    if (layerInfo?.type === 'wms') {
        return createWmsLayerConfig(layerInfo.url || gpUrl, layerInfo.name);
    }

    const source = new ol.source.XYZ({
        url: layerInfo?.tileUrl || DEMO_TILE_URL,
        attributions: 'Geoportal Philippines demo layer',
        crossOrigin: 'anonymous'
    });

    const layer = new ol.layer.Tile({
        source,
        visible: true,
        zIndex: 101
    });

    return { source, layer };
}
