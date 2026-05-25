import { ANNOTATION_LAYER_ID, DRAWING_LAYER_ID } from '../config/constants.js';
import ol from '../lib/ol.js';
import { getMap, getState } from '../state/store.js';
import { findLayerNameByLayer } from './layer-manager.js';
import { updateManagedLayerStyle } from './layer-manager.js';

function isManagedVectorLayer(layer) {
    if (!(layer instanceof ol.layer.Vector)) {
        return false;
    }

    const layerName = findLayerNameByLayer(layer);
    if (!layerName || layerName === ANNOTATION_LAYER_ID || layerName === DRAWING_LAYER_ID) {
        return false;
    }

    const record = getState().uploadedLayers[layerName];
    return Boolean(record && !record.isWMS && typeof record.color === 'string');
}

function refreshHighlightStyles(select, getSelectedAnnotationMode) {
    const map = getMap();

    map.getLayers().forEach((layer) => {
        if (!isManagedVectorLayer(layer)) {
            return;
        }

        updateManagedLayerStyle(findLayerNameByLayer(layer));
    });
}

export function setupMapInteractions({ getSelectedAnnotationMode, onAnnotationSelect, onPointerDown, onPointerMove, onPointerUp }) {
    const map = getMap();
    const select = new ol.interaction.Select({
        condition: ol.events.condition.click,
        layers: isManagedVectorLayer
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
