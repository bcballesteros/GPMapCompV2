import { ANNOTATION_LAYER_ID, DRAWING_LAYER_ID } from '../config/constants.js';
import { getLayerRecord, getMap, getState } from '../state/store.js';

function getStatusElement(id) {
    return document.getElementById(id);
}

function getOperationalLayerNames() {
    return Object.keys(getState().uploadedLayers).filter((layerName) => layerName !== ANNOTATION_LAYER_ID && layerName !== DRAWING_LAYER_ID);
}

function getActiveModalId() {
    const activeModal = document.querySelector('.modal-overlay.active');
    return activeModal?.id || null;
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
            secondary: 'Remote WMS and GP layers can be shown or hidden and faded with opacity.'
        };
    }

    if (record.isPointLayer) {
        return {
            primary: `${layerName} is selected.`,
            secondary: 'Use the layer card to change point color, size, marker style, optional stroke, and opacity, then open the attribute table for details.'
        };
    }

    if (record.isLineLayer) {
        return {
            primary: `${layerName} is selected.`,
            secondary: 'Use the layer card to change stroke color, width, and opacity, then open the attribute table for details.'
        };
    }

    if (record.isPolygonLayer) {
        return {
            primary: `${layerName} is selected.`,
            secondary: 'Use the layer card to change fill color, border color, border width, and opacity, then open the attribute table for details.'
        };
    }

    return {
        primary: `${layerName} is selected.`,
        secondary: 'Use the layer card to change opacity, toggle visibility, and open the attribute table for details.'
    };
}

function buildDrawingHelp(drawingType) {
    const label = {
        point: 'Point',
        line: 'Line',
        polygon: 'Polygon',
        freehand: 'Freehand'
    }[drawingType] || 'Drawing';

    const secondary = {
        point: 'Click the map to place a point. Press Esc or right-click to cancel.',
        line: 'Click to add vertices, then double-click to finish the line. Press Esc or right-click to cancel.',
        polygon: 'Click to add polygon vertices, then double-click to finish. Press Esc or right-click to cancel.',
        freehand: 'Drag on the map to sketch freehand. Release the pointer to finish the stroke. Press Esc or right-click to cancel.'
    }[drawingType] || 'Use the drawing tools to sketch points, lines, polygons, or freehand lines. Delete Selected removes one drawing and Clear All removes them all.';

    return {
        primary: `${label} drawing active.`,
        secondary
    };
}

function buildModalHelp(modalId) {
    if (modalId === 'uploadModal') {
        return {
            primary: 'Add geospatial data.',
            secondary: 'Upload a file, or switch to WMS or GP to connect a service. Give the layer a name, choose a color, then upload.'
        };
    }

    if (modalId === 'wmsModal') {
        return {
            primary: 'Connect a WMS service.',
            secondary: 'Enter the service URL, fetch capabilities, then check the layers you want to add.'
        };
    }

    if (modalId === 'gpModal') {
        return {
            primary: 'Connect Geoportal layers.',
            secondary: 'Enter a portal or map service URL, fetch layers, then select the ones you want to add.'
        };
    }

    if (modalId === 'exportModal') {
        return {
            primary: 'Export the current map view.',
            secondary: 'Choose PNG, JPEG, or PDF. The preview mirrors the current map before you download.'
        };
    }

    if (modalId === 'shareModal') {
        return {
            primary: 'Share the current map state.',
            secondary: 'Copy the link or generate a new one to preserve layers, view, and settings.'
        };
    }

    if (modalId === 'attributesModal') {
        return {
            primary: 'Browse layer attributes.',
            secondary: 'Use search to filter records and inspect feature details for the selected layer.'
        };
    }

    return null;
}

function buildDefaultHelp(hasLayers) {
    if (!hasLayers) {
        return {
            primary: 'Add a layer or connect a service to begin.',
            secondary: 'Use Add Layer for files, WMS, or GP sources. Drag the map to pan, use zoom controls, and search for a place to jump there quickly.'
        };
    }

    return {
        primary: 'Pan, zoom, or pick a tool to continue.',
        secondary: 'Select a layer to style it, or use the drawing, measurement, and annotation tools to build your map. You can also search for a place, change the basemap, adjust Map Settings, or export when you are ready.'
    };
}

function buildHelpContent() {
    const state = getState();
    const activeLayerName = state.currentLayerName;
    const activeLayerRecord = activeLayerName ? getLayerRecord(activeLayerName) : null;
    const hasLayers = getOperationalLayerNames().length > 0;
    const activeModalId = getActiveModalId();

    const modalHelp = activeModalId ? buildModalHelp(activeModalId) : null;
    if (modalHelp) {
        return modalHelp;
    }

    if (!hasLayers) {
        return buildDefaultHelp(false);
    }

    if (state.annotationMode === 'text') {
        return {
            primary: 'Click the map to place a note.',
            secondary: 'Type the text in the popup, then choose font size and color before adding it. Press Esc or right-click to cancel placement.'
        };
    }

    if (state.selectedTool === 'annotation:labels') {
        return {
            primary: 'Feature labels are ready.',
            secondary: 'Turn labels on for the selected vector layer to show key attributes on the map.'
        };
    }

    if (state.selectedTool?.startsWith?.('drawing:')) {
        const drawingType = state.selectedTool.split(':')[1];
        return buildDrawingHelp(drawingType);
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
            secondary: 'Click to add polygon vertices, then double-click to finish. The result shows area and perimeter. Press Esc or right-click to cancel.'
        };
    }

    const selectedFeatureHelp = buildSelectedFeatureHelp(state.selectedFeature);
    if (selectedFeatureHelp) {
        return selectedFeatureHelp;
    }

    if (activeLayerName && activeLayerRecord) {
        return buildLayerHelp(activeLayerName, activeLayerRecord);
    }

    if (state.currentSearchResult) {
        return {
            primary: 'Location found.',
            secondary: 'Drag the map to pan, use the zoom controls to refine the view, or press Esc in the search box to clear the result.'
        };
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

    window.addEventListener('gpmap:modalchange', () => {
        updateSmartHelpPanel();
    });

    mapContainer?.setAttribute('title', 'Scroll to zoom, drag to pan, and use the status bar for live map reference.');
}
