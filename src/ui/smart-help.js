import { ANNOTATION_LAYER_ID, DRAWING_LAYER_ID } from '../config/constants.js';
import { getLayerRecord, getState } from '../state/store.js';

const byId = id => document.getElementById(id);
const help = (primary, secondary) => ({ primary, secondary });

const sectionHelp = {
    mapSettings: help('Map Settings', 'Show or hide the north arrow, scale bar, active layer labels, or text annotations.'),
    measurement: help('Measurement Tools', 'Choose Measure Distance or Measure Area, add vertices, then double-click to finish.'),
    drawing: help('Drawing Tools', 'Choose Point, Line, Polygon, or Freehand. Turn off the drawing tool to select a finished drawing.'),
    annotation: help('Annotation Tools', 'Choose Add Text Annotation and click its map location. Use Show Text Annotations to control all map notes.'),
    saving: help('Feature Saving', 'Save annotations, drawings, and measurements to a GPMapCompV2 JSON file, or use Load Features to add them back to the map.'),
    advanced: help('Advanced Layers', 'Connect a WMS service or browse the Geoportal Philippines catalog.')
};

const controlHelp = {
    '#northArrowToggle': help('North arrow', 'Show or hide the north arrow on the map.'),
    '#scaleBarToggle': help('Scale bar', 'Show or hide the map scale, which updates as you zoom.'),
    '#labelsToggle': help('Active layer labels', 'Show or hide labels on layers with Show Labels enabled.'),
    '#annotationsToggle, #annotationToolsTextToggle': help('Text annotation visibility', 'Show or hide all text annotations on the map.'),
    '#loadFeaturesBtn': help('Load saved map features', 'Choose a GPMapCompV2 JSON file to add its annotations, drawings, and measurements to the workspace.'),
    '#toggleAnnotationLabelVisibilityBtn': help('Selected annotation label', 'Show or hide the label for this note. The label must stay visible if its point is hidden.'),
    '#toggleAnnotationPointVisibilityBtn': help('Selected annotation point', 'Show or hide the point for this note. At least the text or point must remain visible.'),
    '#zoomIn, #zoomOut, #resetView': help('Navigate the map', 'Drag to pan, use + or − to zoom, or use Home View to return to the starting extent.'),
    '.layer-toggle': help('Layer visibility', 'Show or hide this layer while keeping its settings.'),
    '.transparency-slider': help('Layer opacity', 'Lower opacity to reveal layers beneath this one.'),
    '.marker-type-current, .marker-type-option, .marker-type-select, .marker-preset-btn': help('Point marker presets', 'Choose a built-in marker shape. Size, fill and stroke can be adjusted in Manual styling.'),
    '.svg-marker-upload-button, .svg-marker-input, .svg-marker-thumbnail': help('Custom SVG markers', 'Upload SVG files, then select a thumbnail to use that marker on the layer.'),
    '.point-size-slider': help('Point marker size', 'Adjust the size of the selected preset or SVG marker.'),
    '.marker-stroke-enabled': help('Point marker outline', 'Use Show Stroke to show or hide the outline on a preset marker. Stroke Color and Stroke Width stay available when the outline is off.'),
    '[data-vector-color="markerStrokeColor"]': help('Point stroke color', 'Choose a color for the preset marker outline.'),
    '.marker-stroke-width-slider': help('Point stroke width', 'Adjust the preset marker outline thickness in pixels.'),
    '.line-width-slider': help('Line width', 'Adjust the thickness of the line symbol in pixels.'),
    '.polygon-style-mode': help('Polygon styling', 'Choose Single Color or Categorized styling. Categorized uses attribute values to assign fills.'),
    '.polygon-classification-field': help('Classification attribute', 'Choose the field used to group polygons. The legend shows the category colors.'),
    '[data-vector-color="polygonFillColor"]': help('Polygon fill color', 'Choose the interior color in Single Color styling.'),
    '.polygon-stroke-enabled': help('Polygon outline', 'Use Show Stroke to show or hide polygon boundaries.'),
    '[data-vector-color="polygonStrokeColor"]': help('Polygon stroke color', 'Choose the color of visible polygon boundaries.'),
    '.polygon-width-slider': help('Polygon stroke width', 'Adjust the thickness of visible polygon boundaries in pixels.'),
    '.polygon-sld-import, .polygon-sld-input': help('Import polygon SLD', 'Choose an SLD with polygon rules. Supported fills, outlines and patterns appear on the map and in the legend.'),
    '.vector-sld-import, .vector-sld-input, .vector-style-mode': help('Point and line SLD styling', 'Import an SLD to apply its symbols and legend. Choose Manual to edit your marker or line settings.'),
    '.layer-actions-trigger': help('Layer actions', 'Use Zoom to Layer when its extent is available, or Rename to change its display name.')
};

const importHelp = {
    shapefile: help('Import a Shapefile', 'Choose a ZIP containing the Shapefile and its companion files, then choose Upload.'),
    geojson: help('Import GeoJSON', 'Choose a .geojson or .json file with vector features, then choose Upload.'),
    kml: help('Import KML', 'Choose a .kml file with map features, then choose Upload.'),
    csv: help('Import CSV points', 'Choose a CSV with latitude and longitude columns, then choose Upload to plot the coordinates.'),
    geopackage: help('Import a vector GeoPackage', 'Choose a .gpkg file to list the vector feature tables available to import.')
};

const drawingInstructions = {
    point: 'Click the map to place a point.',
    line: 'Click to add vertices and double-click to finish the line.',
    polygon: 'Click to add vertices and double-click to finish the polygon.',
    freehand: 'Drag on the map to sketch freehand, then release to finish.'
};

function layerHelp(name, record) {
    if (!record || name === ANNOTATION_LAYER_ID || name === DRAWING_LAYER_ID) return null;
    if (record.isGP || record.isWMS) {
        return help(`${record.isGP ? 'Geoportal' : 'WMS'} layer selected · ${name}`,
            'Toggle visibility or expand the layer to adjust opacity. Use the layer menu to rename it or zoom to its available extent.');
    }
    const geometry = record.isPointLayer ? 'point' : record.isLineLayer ? 'line' : record.isPolygonLayer ? 'polygon' : null;
    const styling = {
        point: 'Choose a preset or SVG marker and adjust size, fill, stroke, or opacity.',
        line: 'Adjust line color, width, and opacity, or import an SLD.',
        polygon: 'Adjust fill, stroke, and opacity, or style by attribute or SLD. Check the legend to review the symbols.'
    };
    return help(geometry ? `${geometry[0].toUpperCase()}${geometry.slice(1)} layer selected · ${name}` : `Vector layer selected · ${name}`,
        `${styling[geometry] || 'Adjust visibility and opacity.'} Use Layer Information for attributes and labels.`);
}

function featureHelp(feature) {
    if (feature?.get('isAnnotation')) {
        return help('Annotation selected.', 'Edit the text or appearance, move the note, toggle its label or point, or delete it. Clear All Annotations removes every note.');
    }
    const measurement = feature?.get('measurementType');
    if (measurement) {
        return help(`${measurement === 'area' ? 'Area' : 'Distance'} measurement selected.`,
            measurement === 'area'
                ? 'Review area and perimeter in the result panel, delete this result, or clear all measurements.'
                : 'Review the distance result, delete this result, or clear all measurements.');
    }
    const drawing = feature?.get('drawingType');
    if (drawing) {
        return help(`${drawing[0].toUpperCase() + drawing.slice(1)} drawing selected.`,
            'Delete Selected removes this shape. Clear All removes every drawing.');
    }
    return null;
}

function operationHelp(tool, annotationMove, drawingFinished) {
    const cancel = 'Press Esc or right-click to cancel.';
    if (annotationMove) return help('Move the selected annotation', `Drag its point to a new location. ${cancel}`);
    if (tool === 'annotation:text') return help('Place a text annotation', `Click its map location, then enter the note. ${cancel}`);
    if (tool === 'measurement:distance') return help('Distance measurement active.', `Click to start and add vertices. Double-click to finish. ${cancel}`);
    if (tool === 'measurement:area') return help('Area measurement active.', `Click to add polygon vertices and double-click to finish. The result includes perimeter. ${cancel}`);
    const drawing = tool?.startsWith('drawing:') && tool.split(':')[1];
    if (drawingInstructions[drawing]) {
        const title = drawing[0].toUpperCase() + drawing.slice(1);
        return drawingFinished
            ? help(`${title} drawing added.`, 'The drawing tool stays on for another shape. Press Esc or right-click to turn it off and select a finished drawing.')
            : help(`${title} drawing active.`, `${drawingInstructions[drawing]} ${cancel}`);
    }
    return null;
}

function modalHelp(id, step) {
    if (id === 'uploadModal') {
        const tab = document.querySelector('#uploadModal [aria-selected="true"]')?.dataset.geospatialTab;
        if (tab === 'wms') return help('Connect a WMS service', 'Enter the service URL, choose Fetch, then check the layers to add. Choose Done when finished.');
        if (tab === 'geoportal') return help('Browse Geoportal layers', 'Search the Geoportal Philippines catalog and check published layers to add them. Choose Done when finished.');
        const type = byId('dataTypeSelect').value;
        if (step === 'upload-color') return help('Initial layer color', 'Choose the starting color for the uploaded layer.');
        if (type === 'geopackage' && getState().currentLayerData?.tables?.length) {
            return help('Choose GeoPackage tables', 'Check the vector feature tables to add, then choose Upload. Each selected table becomes a layer.');
        }
        return importHelp[type] || help('Add geospatial data', 'Choose a supported vector file type, or select the WMS or Geoportal tab.');
    }
    if (id === 'exportModal') {
        const format = document.querySelector('#exportModal input[name="exportFormat"]:checked')?.value.toUpperCase();
        return help(`Export map · ${format || 'choose a format'}`, 'Choose PNG, JPEG, or PDF. Review the preview, then choose Download to save the current view.');
    }
    if (id === 'shareModal') {
        if (step === 'recipient') return help('Add recipients', 'Enter an email and press Enter or comma to add it. Review the preview before sending each recipient a link.');
        return help(`Share map · ${byId('shareFormat').value.toUpperCase()}`, 'Choose a format, add recipient emails, review the preview, then choose Send. Each recipient receives an individual link.');
    }
    if (id === 'attributesModal') return help('Browse layer attributes', 'Type in Search records to filter rows by attribute value.');
    if (id === 'featureSaveModal') return help('Save map features', 'Choose which features to include and save a local JSON file. Use Load Features to add them back later.');
    if (id === 'confirmationModal') return help('Confirm the action', 'Review what will be removed. Choose Cancel to keep it, or confirm to proceed.');
    return null;
}

export function notifySmartHelp(action, value) {
    window.dispatchEvent(new CustomEvent('gpmap:helpaction', { detail: { action, value } }));
}

export function initializeSmartHelp(map) {
    const panel = byId('smartHelpPanel');
    const primary = byId('smartHelpPrimary');
    const secondary = byId('smartHelpSecondary');
    const sidebar = byId('toolsSidebar');
    const modals = new Map();
    let recent = null;
    let popup = null;
    let annotationMove = false;
    let drawingFinished = false;
    let scheduled = false;

    // Modal and in-progress map instructions are temporary overrides. The latest
    // meaningful action wins underneath them and is validated against live state.
    function resolve() {
        const { currentLayerName, currentSearchResult, selectedFeature, selectedTool, uploadedLayers } = getState();
        const record = getLayerRecord(currentLayerName);
        const layer = layerHelp(currentLayerName, record);
        if (popup === 'placement') return help('Add annotation text', 'Enter the note and choose its font size and color. Add it to the map or cancel.');
        if (popup === 'editing') return help('Edit annotation', 'Change the text, font size, or color, then choose Save.');
        if (popup === 'rename') return help('Rename layer', 'Enter a new display name and choose Save, or press Esc to cancel.');

        const operation = operationHelp(selectedTool, annotationMove, drawingFinished);
        if (operation && (annotationMove || !drawingFinished)) return operation;

        if (recent?.kind === 'feature') {
            const feature = featureHelp(selectedFeature);
            if (feature) return feature;
        }
        if (recent?.kind === 'vector' && getLayerRecord(recent.value)) {
            return help(`Vector feature selected · ${recent.value}`, 'Click the map to change the selection. Use Layer Information to inspect the active layer’s records.');
        }
        if (recent?.kind === 'tool' && operation) return operation;
        if (recent?.kind === 'layer' && layer) return layer;
        if (recent?.kind === 'result' && currentSearchResult) {
            return help('Location found', 'Pan or zoom from the result. Use Clear search or press Esc in the search box to remove its marker.');
        }
        if (recent?.kind === 'section' && recent.element.getAttribute('aria-expanded') === 'true') {
            if (recent.value === 'information') return labelHelp(record);
            if (sectionHelp[recent.value]) return sectionHelp[recent.value];
        }
        if (recent?.kind === 'labels') return labelHelp(record);
        if (recent?.kind === 'control' && (!recent.owner || recent.owner.isConnected)
            && (!recent.section || recent.section.classList.contains('expanded'))
            && (!recent.inspector || !recent.inspector.hidden)) {
            if (recent.element?.classList.contains('layer-expand-btn')) {
                const item = recent.owner;
                const name = item.dataset.layerName;
                const expandedLayer = layerHelp(name, getLayerRecord(name));
                if (expandedLayer) {
                    return item.classList.contains('collapsed')
                        ? help(`Layer controls collapsed · ${name}`, 'Expand the layer again to access its display controls.')
                        : expandedLayer;
                }
            } else {
                return recent.content;
            }
        }
        if (operation) return operation;
        if (layer) return layer;
        const hasLayers = Object.keys(uploadedLayers).some(name => name !== ANNOTATION_LAYER_ID && name !== DRAWING_LAYER_ID);
        return hasLayers
            ? help('Select a layer or choose a tool', 'Select a layer to inspect it. Upper layers draw above lower ones. Use Tools & Properties to add notes, drawings, or measurements.')
            : help('Start with a dataset or service', 'Use Add Geospatial Data to upload vector data, connect WMS, or browse Geoportal layers. Search can take you to a place first.');
    }

    function render() {
        scheduled = false;
        const [modalId, step] = Array.from(modals).at(-1) || [];
        const modalContent = modalHelp(modalId, step);
        const content = modalContent || resolve();
        if (primary.textContent !== content.primary) primary.textContent = content.primary;
        if (secondary.textContent !== content.secondary) secondary.textContent = content.secondary;
    }

    // Group synchronous changes from one interaction before updating the live region.
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(render);
    }

    function use(kind, details) {
        recent = kind ? { kind, ...details } : null;
        schedule();
    }

    function clear(kind) {
        if (recent?.kind === kind) use(null);
        else schedule();
    }

    window.addEventListener('gpmap:statechange', ({ detail: { key, value } }) => {
        switch (key) {
        case 'currentLayerName': value ? use('layer') : clear('layer'); break;
        case 'selectedFeature': value ? use('feature') : clear('feature'); break;
        case 'selectedTool':
            drawingFinished = false;
            if (value === 'annotation:labels') use('labels');
            else if (value) use('tool');
            else clear('tool');
            break;
        case 'currentSearchResult':
            if (value) {
                if (recent?.search) use('result');
            } else if (recent?.kind === 'result' || recent?.search) use(null);
            break;
        case 'activeBasemap': use('control', { content: help('Basemap changed', 'Choose a basemap that gives your operational layers enough contrast.') }); break;
        case 'currentLayerData':
        case 'uploadedLayers': schedule(); break;
        }
    });

    window.addEventListener('gpmap:modalchange', ({ detail: { modalId, isOpen } }) => {
        if (isOpen) modals.set(modalId, null);
        else modals.delete(modalId);
        schedule();
    });

    window.addEventListener('gpmap:annotationeditoropen', () => {
        popup = 'editing';
        use('feature');
    });

    window.addEventListener('gpmap:helpaction', ({ detail: { action, value } }) => {
        if (action === 'section') {
            if (value.getAttribute('aria-expanded') === 'true') use('section', { element: value, value: value.closest('.tool-section-group').dataset.helpSection });
            else if (recent?.element === value) use(null);
        } else if (action === 'popup') {
            popup = value;
        } else if (action === 'move') {
            annotationMove = value;
            if (value) use('feature');
        } else if (action === 'drawing') {
            drawingFinished = value;
            use('tool');
        } else if (action === 'zoomLayer') {
            use('control', { content: help('Zoom to Layer', 'The map fits the available layer extent. Pan or zoom to refine the view.') });
        } else if (action === 'vectorSelection') {
            if (!value) clear('vector');
            else if (!getState().selectedFeature?.get('isAnnotation')) use('vector', { value });
        } else if (action === 'uploadTab') {
            if (modals.has('uploadModal')) modals.set('uploadModal', null);
        }
        schedule();
    });

    const search = byId('locationSearchForm');
    const searchHelp = help('Search for a location', 'Enter a place name and submit to find it on the map.');
    search.addEventListener('input', () => {
        if (!recent?.search) use('control', { content: searchHelp, search: true });
    });
    search.addEventListener('submit', () => use('control', { content: searchHelp, search: true }), true);
    map.on('singleclick', () => {
        if (['section', 'labels', 'control'].includes(recent?.kind)) use(null);
    });

    const controlSelectors = Object.keys(controlHelp);
    function handleControl(event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (event.type === 'input' && !target.matches('input[type="range"]')) return;
        if (event.type === 'click' && target.matches('select, option, input:not([type="range"])')) return;
        const owner = target.closest('.layer-item');
        const section = target.closest('.tool-section-group');
        const inspector = target.closest('.contextual-inspector');
        const element = target.closest('.layer-expand-btn');
        const selector = controlSelectors.find(key => target.closest(key));
        let content = controlHelp[selector];
        if (target.matches('#labelAttributeSelect')) content = labelHelp(getLayerRecord(getState().currentLayerName));
        if (target.closest('[data-vector-color="color"]') && owner) {
            content = getLayerRecord(owner.dataset.layerName)?.isLineLayer
                ? help('Line color', 'Choose the stroke color in Manual line styling.')
                : help('Point fill color', 'Choose the interior color for the preset marker.');
        }
        if ((content || element) && (recent?.content !== content || recent?.owner !== owner || recent?.element !== element)) {
            use('control', { content, owner, element, section, inspector });
        } else if (element) schedule();
    }

    for (const root of [sidebar, byId('layersSidebar'), document.querySelector('.map-control-stack')]) {
        for (const event of ['click', 'input', 'change']) root.addEventListener(event, handleControl, true);
    }
    byId('layersSidebar').addEventListener('dragstart', event => {
        if (!event.target.closest('.layer-drag-handle')) return;
        use('control', { content: help('Reorder map layers', 'Drag the layer to its new position. Higher layers render above lower layers.') });
    });
    byId('dataTypeSelect').addEventListener('change', () => {
        if (modals.has('uploadModal')) modals.set('uploadModal', null);
        schedule();
    });
    byId('exportModal').addEventListener('change', schedule);
    byId('shareFormat').addEventListener('change', () => {
        if (modals.has('shareModal')) modals.set('shareModal', null);
        schedule();
    });
    byId('layerColor').addEventListener('click', () => {
        if (modals.has('uploadModal')) modals.set('uploadModal', 'upload-color');
        schedule();
    });
    byId('recipientChips').addEventListener('input', () => {
        if (modals.has('shareModal') && modals.get('shareModal') !== 'recipient') {
            modals.set('shareModal', 'recipient');
            schedule();
        }
    });
    render();
}

function labelHelp(record) {
    if (!record || record.isWMS || record.isGP) {
        return help('Layer Information', 'Select an uploaded vector layer to view its attribute table and label options.');
    }
    return help('Layer Information', 'Choose a Label Attribute and enable Show Labels, or open View Attribute Table to inspect the records.');
}
