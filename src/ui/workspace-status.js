import { getLayerRecord, getMap, getState } from '../state/store.js';

function getStatusElement(id) {
    return document.getElementById(id);
}

function getOperationalLayerNames() {
    return Object.keys(getState().uploadedLayers).filter((layerName) => layerName !== 'annotations');
}

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

    return record.isWMS ? `${activeLayerName} (WMS)` : activeLayerName;
}

function buildHelpContent() {
    const state = getState();
    const activeLayerName = state.currentLayerName;
    const activeLayerRecord = activeLayerName ? getLayerRecord(activeLayerName) : null;
    const hasLayers = getOperationalLayerNames().length > 0;

    if (!hasLayers) {
        return {
            primary: 'Upload a layer to begin.',
            secondary: 'Add a dataset from the Layers panel to start styling, analysis, and export.'
        };
    }

    if (state.annotationMode === 'text') {
        return {
            primary: 'Click map to place annotation.',
            secondary: 'After clicking, enter the label text, font size, and color in the popup.'
        };
    }

    if (state.selectedTool === 'annotation:labels') {
        return {
            primary: 'Feature labels updated.',
            secondary: 'Use Feature Labels to toggle attribute labels for the selected vector layer.'
        };
    }

    if (state.selectedFeature?.get?.('isAnnotation')) {
        return {
            primary: 'Annotation selected.',
            secondary: 'Use Edit, Move, or Delete in the annotation panel to update the selected note.'
        };
    }

    if (activeLayerName && activeLayerRecord) {
        return {
            primary: `${activeLayerName} is selected.`,
            secondary: activeLayerRecord.isWMS
                ? 'Use Map Settings and layer visibility controls to manage this remote service layer.'
                : 'Use Data Analysis to inspect attributes, then adjust styling and opacity from the Layers panel.'
        };
    }

    return {
        primary: 'Select a layer to continue.',
        secondary: 'Choose a layer from the Layers panel to inspect attributes or adjust styling.'
    };
}

export function updateSmartHelpPanel() {
    const primary = getStatusElement('smartHelpPrimary');
    const secondary = getStatusElement('smartHelpSecondary');
    if (!primary || !secondary) {
        return;
    }

    const content = buildHelpContent();
    primary.textContent = content.primary;
    secondary.textContent = content.secondary;
}

export function updateMapStatusBar() {
    const map = getMap();
    const view = map?.getView?.();

    const zoomEl = getStatusElement('statusZoom');
    const projectionEl = getStatusElement('statusProjection');
    const layerEl = getStatusElement('statusLayer');

    if (zoomEl) {
        const zoom = view?.getZoom?.();
        zoomEl.textContent = Number.isFinite(zoom) ? zoom.toFixed(1) : '--';
    }

    if (projectionEl) {
        projectionEl.textContent = view?.getProjection?.()?.getCode?.() || '--';
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

    const mapContainer = document.getElementById('mapContainer');
    const view = map.getView();

    updateSmartHelpPanel();
    updateMapStatusBar();

    view.on('change:center', () => updateMapStatusBar());
    view.on('change:resolution', () => updateMapStatusBar());
    view.on('change:rotation', () => updateMapStatusBar());

    window.addEventListener('gpmap:statechange', () => {
        updateSmartHelpPanel();
        updateMapStatusBar();
    });

    mapContainer?.setAttribute('title', 'Scroll to zoom, drag to pan, and use the status bar for live map reference.');
}
