import { ANNOTATION_LAYER_ID } from '../config/constants.js';
import ol from '../lib/ol.js';
import { getMap, getState } from '../state/store.js';
import { createFeatureStyle, createLabelStyle } from '../map/style-factory.js';
import { findLayerNameByLayer } from '../map/layer-manager.js';
import { showToast } from '../ui/toast.js';

export function applyLabelsVisibility(isVisible) {
    const map = getMap();
    const uploadedLayers = getState().uploadedLayers;

    map.getLayers().forEach((layer) => {
        if (!(layer instanceof ol.layer.Vector)) {
            return;
        }

        const layerName = findLayerNameByLayer(layer);
        if (!layerName || layerName === ANNOTATION_LAYER_ID) {
            return;
        }

        const record = uploadedLayers[layerName];
        layer.setStyle((feature) => {
            const styles = [createFeatureStyle(record.color, record.opacity)];

            if (isVisible) {
                const propKeys = Object.keys(feature.getProperties());
                const firstProp = propKeys.find((key) => typeof feature.get(key) === 'string' && feature.get(key).length < 50);
                if (firstProp) {
                    styles.push(createLabelStyle(feature.get(firstProp)));
                }
            }

            return styles;
        });
    });

    showToast('Labels', isVisible ? 'Layer labels shown' : 'Layer labels hidden', 'info', 1500);
}
