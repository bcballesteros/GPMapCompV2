import { ANNOTATION_LAYER_ID } from '../config/constants.js';
import { getMap, getState } from '../state/store.js';
import { createFeatureStyle } from './style-factory.js';
import { findLayerNameByLayer } from './layer-manager.js';

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

        const record = uploadedLayers[layerName];
        const isHighlightMode = getSelectedAnnotationMode() === 'highlight';

        layer.setStyle((feature) => {
            const isSelected = select.getFeatures().getArray().includes(feature);
            return createFeatureStyle(record.color, record.opacity, isHighlightMode && isSelected);
        });
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
    map.on('pointerdown', onPointerDown);
    map.on('pointermove', onPointerMove);
    map.on('pointerup', onPointerUp);
    map.on('click', onAnnotationSelect);

    return select;
}
