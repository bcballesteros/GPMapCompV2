import ol from '../lib/ol.js';

export function createWmsLayerConfig(wmsUrl, wmsLayerName) {
    let baseUrl = wmsUrl.includes('?') ? wmsUrl.split('?')[0] : wmsUrl;
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }

    const source = new ol.source.TileWMS({
        url: baseUrl,
        params: {
            LAYERS: wmsLayerName,
            TILED: true,
            VERSION: '1.1.1'
        },
        serverType: 'geoserver',
        crossOrigin: 'anonymous',
        transition: 0
    });

    const layer = new ol.layer.Tile({
        source,
        visible: true,
        zIndex: 100
    });

    return { source, layer };
}
