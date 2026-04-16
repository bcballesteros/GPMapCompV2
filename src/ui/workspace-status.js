import { DEFAULT_MAP_PROJECTION } from '../config/defaults.js';
import ol from '../lib/ol.js';
import { getLayerRecord, getMap, getState } from '../state/store.js';

function getStatusElement(id) {
    return document.getElementById(id);
}

function formatCoordinatePair(coordinate) {
    if (!coordinate) {
        return 'Move cursor over map';
    }

    const lonLat = ol.proj.transform(coordinate, DEFAULT_MAP_PROJECTION, 'EPSG:4326');
    const [lon, lat] = lonLat;

    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function formatScale(view) {
    const projection = view?.getProjection?.();
    const resolution = view?.getResolution?.();
    if (!projection || !resolution) {
        return '--';
    }

    const metersPerUnit = projection.getMetersPerUnit?.() || 1;
    const dpi = 25.4 / 0.28;
    const inchesPerMeter = 39.37;
    const scale = resolution * metersPerUnit * inchesPerMeter * dpi;

    if (!Number.isFinite(scale)) {
        return '--';
    }

    return `1:${Math.round(scale).toLocaleString()}`;
}

function getOperationalLayerNames() {
    return Object.keys(getState().uploadedLayers).filter((layerName) => layerName !== 'annotations');
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

    if (state.annotationMode === 'highlight') {
        return {
            primary: 'Click a feature to highlight it.',
            secondary: 'Use highlight mode to focus attention on a feature without changing the layer source.'
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

export function updateMapStatusBar(coordinate = null) {
    const map = getMap();
    const view = map?.getView?.();

    const coordinatesEl = getStatusElement('statusCoordinates');
    const zoomEl = getStatusElement('statusZoom');
    const scaleEl = getStatusElement('statusScale');
    const projectionEl = getStatusElement('statusProjection');

    if (coordinatesEl) {
        coordinatesEl.textContent = formatCoordinatePair(coordinate);
    }

    if (zoomEl) {
        const zoom = view?.getZoom?.();
        zoomEl.textContent = Number.isFinite(zoom) ? zoom.toFixed(1) : '--';
    }

    if (scaleEl) {
        scaleEl.textContent = formatScale(view);
    }

    if (projectionEl) {
        projectionEl.textContent = view?.getProjection?.()?.getCode?.() || '--';
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

    map.on('pointermove', (event) => {
        if (event.dragging) {
            return;
        }

        updateMapStatusBar(event.coordinate);
    });

    map.getViewport().addEventListener('pointerleave', () => {
        updateMapStatusBar();
    });

    view.on('change:center', () => updateMapStatusBar());
    view.on('change:resolution', () => updateMapStatusBar());
    view.on('change:rotation', () => updateMapStatusBar());

    window.addEventListener('gpmap:statechange', updateSmartHelpPanel);

    mapContainer?.setAttribute('title', 'Scroll to zoom, drag to pan, and use the status bar for live map reference.');
}
