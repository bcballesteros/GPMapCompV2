import { getLayerRecord, getMap, getState } from '../state/store.js';
import { initializeSmartHelp } from './smart-help.js';

function getActiveLayerLabel() {
    const state = getState();
    const activeLayerName = state.currentLayerName;

    if (!activeLayerName) {
        return 'None';
    }

    const record = getLayerRecord(activeLayerName);
    if (!record) {
        return activeLayerName;
    }

    if (record.isGP) {
        return `${activeLayerName} (GP)`;
    }

    return record.isWMS ? `${activeLayerName} (WMS)` : activeLayerName;
}

function getProjectionLabel(view) {
    const mapProjection = view?.getProjection?.()?.getCode?.() || '--';
    const activeLayerName = getState().currentLayerName;
    const activeLayerRecord = activeLayerName ? getLayerRecord(activeLayerName) : null;

    if (!activeLayerRecord) {
        return mapProjection;
    }

    if (activeLayerRecord.sourceCrsDetected && activeLayerRecord.sourceCrs) {
        return activeLayerRecord.sourceCrs;
    }

    if (activeLayerRecord.sourceCrs === 'Unknown CRS') {
        return `Unknown CRS (map ${mapProjection})`;
    }

    return mapProjection;
}

export function updateMapStatusBar() {
    const map = getMap();
    const view = map?.getView?.();

    const zoomEl = document.getElementById('statusZoom');
    const projectionEl = document.getElementById('statusProjection');
    const layerEl = document.getElementById('statusLayer');

    if (zoomEl) {
        const zoom = view?.getZoom?.();
        zoomEl.textContent = Number.isFinite(zoom) ? zoom.toFixed(1) : '--';
    }

    if (projectionEl) {
        projectionEl.textContent = getProjectionLabel(view);
    }

    if (layerEl) {
        layerEl.textContent = getActiveLayerLabel();
    }
}

export function initializeWorkspaceStatus() {
    const map = getMap();
    if (!map) {
        return;
    }

    const view = map.getView();

    initializeSmartHelp(map);
    updateMapStatusBar();

    view.on('change:center', () => updateMapStatusBar());
    view.on('change:resolution', () => updateMapStatusBar());
    view.on('change:rotation', () => updateMapStatusBar());

    window.addEventListener('gpmap:statechange', updateMapStatusBar);
}
