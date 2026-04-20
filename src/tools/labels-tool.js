import { ANNOTATION_LAYER_ID } from '../config/constants.js';
import ol from '../lib/ol.js';
import { getCurrentLayerName, getLayerRecord, getMap, getState } from '../state/store.js';
import { findLayerNameByLayer } from '../map/layer-manager.js';
import { updateManagedLayerStyle } from '../map/layer-manager.js';
import { showToast } from '../ui/toast.js';

function getLabelTargetLayerName() {
    const currentLayerName = getCurrentLayerName();
    if (currentLayerName && currentLayerName !== ANNOTATION_LAYER_ID) {
        return currentLayerName;
    }

    const activeLayer = document.querySelector('.layer-item.active .layer-name');
    return activeLayer?.textContent || null;
}

export function toggleSelectedLayerLabels() {
    const layerName = getLabelTargetLayerName();
    if (!layerName) {
        showToast('No Layer', 'Select a vector layer first to show labels', 'warning', 2000);
        return;
    }

    const record = getLayerRecord(layerName);
    if (!record || record.isWMS) {
        showToast('Labels Unavailable', 'Labels are only available for uploaded vector layers', 'warning', 2200);
        return;
    }

    if (!record.labelField) {
        showToast('No Label Field', 'This layer has no usable attribute field for labels', 'warning', 2200);
        return;
    }

    record.labelsVisible = !record.labelsVisible;
    updateManagedLayerStyle(layerName);
    syncLabelsToggle();

    const actionText = record.labelsVisible ? 'shown' : 'hidden';
    showToast('Feature Labels', `${record.labelField} labels ${actionText} for "${layerName}"`, 'info', 1800);
}

export function syncLabelsToggle() {
    const toggle = document.getElementById('labelsToggle');
    if (!toggle) {
        return;
    }

    const uploadedLayers = Object.entries(getState().uploadedLayers)
        .filter(([layerName, record]) => layerName !== ANNOTATION_LAYER_ID && record && !record.isWMS);

    toggle.checked = uploadedLayers.some(([, record]) => record.labelsVisible);
}

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
        if (!record || record.isWMS) {
            return;
        }

        record.labelsVisible = isVisible && Boolean(record.labelField);
        updateManagedLayerStyle(layerName);
    });

    syncLabelsToggle();
    showToast('Labels', isVisible ? 'Available layer labels shown' : 'All layer labels hidden', 'info', 1500);
}
