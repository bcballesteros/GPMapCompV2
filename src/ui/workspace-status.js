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

function isElementInSelector(element, selector) {
    return Boolean(element?.closest?.(selector));
}

function getOpenWorkflowContext() {
    const activeElement = document.activeElement;

    if (isElementInSelector(activeElement, '#locationSearchForm')) {
        return 'search';
    }

    if (isElementInSelector(activeElement, '.basemap-selector') || isElementInSelector(activeElement, '#basemapSelect')) {
        return 'basemap';
    }

    if (isElementInSelector(activeElement, '.map-settings-section')) {
        return 'mapSettings';
    }

    if (isElementInSelector(activeElement, '.measurement-section')) {
        return 'measurementTools';
    }

    if (isElementInSelector(activeElement, '.drawing-tools-section')) {
        return 'drawingTools';
    }

    if (isElementInSelector(activeElement, '.annotation-tools-section')) {
        return 'annotationTools';
    }

    const openSection = Array.from(document.querySelectorAll('.tool-section-group'))
        .find((section) => !section.querySelector('.tool-section-content')?.classList.contains('collapsed'));

    if (openSection?.classList.contains('map-settings-section')) {
        return 'mapSettings';
    }

    if (openSection?.classList.contains('measurement-section')) {
        return 'measurementTools';
    }

    if (openSection?.classList.contains('drawing-tools-section')) {
        return 'drawingTools';
    }

    if (openSection?.classList.contains('annotation-tools-section')) {
        return 'annotationTools';
    }

    return null;
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
            secondary: 'Edit text, Move the note, Hide/Show its label, or Delete it. Clear All removes every annotation.'
        };
    }

    if (kind === 'drawing') {
        const drawingType = feature.get?.('drawingType') || 'drawing';
        const label = String(drawingType).charAt(0).toUpperCase() + String(drawingType).slice(1);
        return {
            primary: `${label} drawing selected.`,
            secondary: 'Delete Selected removes this shape. Clear All removes every drawing.'
        };
    }

    if (kind === 'measurement') {
        const measurementType = feature.get?.('measurementType') === 'area' ? 'Area' : 'Distance';
        return {
            primary: `${measurementType} measurement selected.`,
            secondary: 'Review the result panel, delete this measurement, or clear all measurements.'
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
            secondary: 'Toggle visibility or adjust opacity. Attribute tables, labels, and vector styling are not available for remote layers.'
        };
    }

    if (record.isPointLayer) {
        const markerHelp = record.svgMarkerDataUrl
            ? 'Select an uploaded SVG thumbnail or switch back to a preset marker.'
            : 'Choose a marker shape, upload SVG markers, then adjust color, size, stroke, and opacity.';
        return {
            primary: `Style point layer: ${layerName}.`,
            secondary: `${markerHelp} Open the attribute table to inspect records.`
        };
    }

    if (record.isLineLayer) {
        return {
            primary: `Style line layer: ${layerName}.`,
            secondary: 'Adjust stroke color, stroke width, and opacity. Open the attribute table to inspect records.'
        };
    }

    if (record.isPolygonLayer) {
        return {
            primary: `Style polygon layer: ${layerName}.`,
            secondary: 'Adjust fill, border color, border width, and opacity. Open the attribute table to inspect records.'
        };
    }

    return {
        primary: `${layerName} is selected.`,
        secondary: 'Toggle visibility, adjust opacity, and open the attribute table when records are available.'
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
            primary: 'Upload Dataset.',
            secondary: 'Choose Shapefile ZIP, GeoJSON, KML, or CSV. Confirm the layer name and color, then upload.'
        };
    }

    if (modalId === 'wmsModal') {
        return {
            primary: 'Connect a WMS service.',
            secondary: 'Enter a WMS URL, fetch capabilities, then check layers to preview them on the map. Use Done when finished.'
        };
    }

    if (modalId === 'gpModal') {
        return {
            primary: 'Connect Geoportal layers.',
            secondary: 'Fetch the catalog, then check Geoportal layers to preview them. Demo layers appear when no live service is available.'
        };
    }

    if (modalId === 'exportModal') {
        return {
            primary: 'Export the current map view.',
            secondary: 'Choose PNG, JPEG, or PDF. Check the preview, then download the visible map view.'
        };
    }

    if (modalId === 'shareModal') {
        return {
            primary: 'Share the current map state.',
            secondary: 'Generate or copy a link for the current view, remote layers, styling, annotations, search result, and settings.'
        };
    }

    if (modalId === 'attributesModal') {
        return {
            primary: 'Browse layer attributes.',
            secondary: 'Search to filter rows. Attribute tables are available for uploaded vector layers only.'
        };
    }

    return null;
}

function buildDefaultHelp(hasLayers) {
    if (!hasLayers) {
        return {
            primary: 'Start with a dataset or service.',
            secondary: 'Use Add Geospatial Data for uploaded datasets, WMS layers, or Geoportal layers. Search can jump the map to a place first.'
        };
    }

    return {
        primary: 'Select a layer or choose a tool.',
        secondary: 'Layer cards control styling and visibility. Drawing, measurement, annotation, search, basemap, export, and share tools use the current map view.'
    };
}

function buildWorkflowHelp(context, activeLayerRecord) {
    if (context === 'search') {
        return {
            primary: 'Search for a location.',
            secondary: 'Type a place name and submit to move the map. Press Esc in the search box to clear the search.'
        };
    }

    if (context === 'basemap') {
        return {
            primary: 'Switch the basemap.',
            secondary: 'Choose a basemap that supports the layer contrast you need. Operational layers stay in place.'
        };
    }

    if (context === 'mapSettings') {
        return {
            primary: 'Adjust Map Settings.',
            secondary: 'Toggle vector labels, annotation text, the scale bar, and the north arrow for the workspace and exports.'
        };
    }

    if (context === 'measurementTools') {
        return {
            primary: 'Measurement Tools.',
            secondary: 'Choose Distance or Area, click to add vertices, and double-click to finish. Use Clear All to remove saved results.'
        };
    }

    if (context === 'drawingTools') {
        return {
            primary: 'Drawing Tools.',
            secondary: 'Choose Point, Line, Polygon, or Freehand. Finished drawings can be selected, deleted individually, or cleared all at once.'
        };
    }

    if (context === 'annotationTools') {
        return {
            primary: 'Annotation Tools.',
            secondary: 'Add text on the map, then select an annotation to edit, move, hide/show, or delete it.'
        };
    }

    if (context === 'labels') {
        if (!activeLayerRecord || activeLayerRecord.isWMS) {
            return {
                primary: 'Labels need a vector layer.',
                secondary: 'Select an uploaded vector layer with attribute fields before turning labels on.'
            };
        }

        return {
            primary: 'Label the selected layer.',
            secondary: activeLayerRecord.labelField
                ? 'Toggle labels to show the layer attribute chosen for map labels.'
                : 'This layer has no usable label field.'
        };
    }

    return null;
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
        return buildWorkflowHelp('labels', activeLayerRecord);
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

    const workflowHelp = buildWorkflowHelp(getOpenWorkflowContext(), activeLayerRecord);
    if (workflowHelp) {
        return workflowHelp;
    }

    if (state.currentSearchResult) {
        return {
            primary: 'Location found.',
            secondary: 'Pan or zoom from here. Press Esc in the search box or use clear to remove the marker.'
        };
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

    window.addEventListener('gpmap:modalchange', () => {
        updateSmartHelpPanel();
    });

    document.addEventListener('focusin', () => updateSmartHelpPanel());
    document.addEventListener('click', () => window.setTimeout(updateSmartHelpPanel, 0));
    document.addEventListener('change', () => updateSmartHelpPanel());
    document.addEventListener('input', () => updateSmartHelpPanel());

    mapContainer?.setAttribute('title', 'Scroll to zoom, drag to pan, and use the status bar for live map reference.');
}
