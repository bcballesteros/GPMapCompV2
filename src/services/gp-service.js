import ol from '../lib/ol.js';
import { createWmsLayerConfig } from './wms-service.js';

export function createGpLayerConfig(gpUrl, layerInfo) {
    if (layerInfo?.type === 'wms') {
        return createWmsLayerConfig(layerInfo.url || gpUrl, layerInfo.name);
    }

    const source = new ol.source.XYZ({
        url: layerInfo?.tileUrl || '',
        attributions: 'Geoportal Philippines',
        crossOrigin: 'anonymous'
    });

    const layer = new ol.layer.Tile({
        source,
        visible: true,
        zIndex: 101
    });

    return { source, layer };
}
