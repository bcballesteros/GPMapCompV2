import { ANNOTATION_LAYER_ID, DRAWING_LAYER_ID } from '../config/constants.js';
import { getLayerRecord, getMap, getState } from '../state/store.js';

function getStatusElement(id) {
    return document.getElementById(id);
}

function getOperationalLayerNames() {
    return Object.keys(getState().uploadedLayers).filter((layerName) => layerName !== ANNOTATION_LAYER_ID && layerName !== DRAWING_LAYER_ID);
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

function isRemoteLayer(record) {
    return Boolean(record?.isWMS || record?.isGP);
}

function getSelectedFeatureKind(feature) {
    if (!feature?.get) {
        return null;
    }

    if (feature.get('isAnnotation')) {
        return 'annotation';
    }

    if (feature.get('measurementType')) {
        return 'measurement';
    }

    if (feature.get('drawingType')) {
        return 'drawing';
    }

    return null;
}

function buildSelectedFeatureHelp(feature) {
    const kind = getSelectedFeatureKind(feature);

    if (kind === 'annotation') {
        return {
            primary: 'Annotation selected.',
            secondary: 'Use Edit, Move, Hide/Show, or Delete to update the note. Clear All removes every annotation.'
        };
    }

    if (kind === 'drawing') {
        const drawingType = feature.get?.('drawingType') || 'drawing';
        const label = String(drawingType).charAt(0).toUpperCase() + String(drawingType).slice(1);
        return {
            primary: `${label} drawing selected.`,
            secondary: 'Delete Selected removes only this shape. Clear All removes every point, line, polygon, and freehand drawing.'
        };
    }

    if (kind === 'measurement') {
        const measurementType = feature.get?.('measurementType') === 'area' ? 'Area' : 'Distance';
        return {
            primary: `${measurementType} measurement selected.`,
            secondary: 'Delete Selected removes only this result. Press Esc to clear the selection or cancel an active measurement.'
        };
    }

    return null;
}

function buildLayerHelp(layerName, record) {
    if (!layerName || !record) {
        return null;
    }

    if (isRemoteLayer(record)) {
        return {
            primary: `${layerName} is selected.`,
            secondary: 'Remote WMS and GP layers can be shown or hidden, reordered, and faded with opacity.'
        };
    }

    const styleTips = [];

    if (record.isPointLayer) {
        styleTips.push('point size');
        styleTips.push('marker style');
    } else if (record.isLineLayer) {
        styleTips.push('line width');
    } else if (record.isPolygonLayer) {
        styleTips.push('fill and border colors');
    }

    styleTips.push('opacity');
    const styleSummary = styleTips.length === 1
        ? styleTips[0]
        : `${styleTips.slice(0, -1).join(', ')}, and ${styleTips[styleTips.length - 1]}`;

    return {
        primary: `${layerName} is selected.`,
        secondary: `Use the layer card to change ${styleSummary}, toggle visibility, and open the attribute table for details.`
    };
}

function buildDefaultHelp(hasLayers) {
    if (!hasLayers) {
        return {
            primary: 'Import data or connect a layer to begin.',
            secondary: 'Use Add Layer for Shapefile, KML, GeoJSON, CSV, WMS, or GP sources. Press Esc to clear a location search.'
        };
    }

    return {
        primary: 'Select a layer or tool to continue.',
        secondary: 'Build your map by styling layers, drawing sketches, measuring features, adding annotations, then export or share the finished map.'
    };
}

function buildHelpContent() {
    const state = getState();
    const activeLayerName = state.currentLayerName;
    const activeLayerRecord = activeLayerName ? getLayerRecord(activeLayerName) : null;
    const hasLayers = getOperationalLayerNames().length > 0;

    if (!hasLayers) {
        return buildDefaultHelp(false);
    }

    if (state.annotationMode === 'text') {
        return {
            primary: 'Click the map to place a note.',
            secondary: 'Type the text in the popup, then choose font size and color before adding it. Right-click cancels placement.'
        };
    }

    if (state.selectedTool === 'annotation:labels') {
        return {
            primary: 'Feature labels are ready.',
            secondary: 'Turn labels on for the selected vector layer to show key attributes on the map.'
        };
    }

    if (state.selectedTool === 'measurement:distance') {
        return {
            primary: 'Distance measurement active.',
            secondary: 'Click to start, add vertices along the path, and double-click to finish. Press Esc or right-click to cancel.'
        };
    }

    if (state.selectedTool === 'measurement:area') {
        return {
            primary: 'Area measurement active.',
            secondary: 'Click to add polygon vertices, then double-click to finish. The result shows area and perimeter, and Esc cancels the sketch.'
        };
    }

    const selectedFeatureHelp = buildSelectedFeatureHelp(state.selectedFeature);
    if (selectedFeatureHelp) {
        return selectedFeatureHelp;
    }

    if (activeLayerName && activeLayerRecord) {
        return buildLayerHelp(activeLayerName, activeLayerRecord);
    }

    return buildDefaultHelp(hasLayers);
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
