import { ANNOTATION_LAYER_ID } from '../config/constants.js';
import ol from '../lib/ol.js';
import { getMap, getState } from '../state/store.js';
import { findLayerNameByLayer } from './layer-manager.js';
import { updateManagedLayerStyle } from './layer-manager.js';

function refreshHighlightStyles(select, getSelectedAnnotationMode) {
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

        if (!uploadedLayers[layerName]) {
            return;
        }

        updateManagedLayerStyle(layerName);
    });
}

export function setupMapInteractions({ getSelectedAnnotationMode, onAnnotationSelect, onPointerDown, onPointerMove, onPointerUp }) {
    const map = getMap();
    const select = new ol.interaction.Select({
        condition: ol.events.condition.click
    });

    select.getFeatures().on('add', () => {
        refreshHighlightStyles(select, getSelectedAnnotationMode);
    });
    select.getFeatures().on('remove', () => {
        refreshHighlightStyles(select, getSelectedAnnotationMode);
    });

    map.addInteraction(select);
    map.on('click', onAnnotationSelect);

    return select;
}
