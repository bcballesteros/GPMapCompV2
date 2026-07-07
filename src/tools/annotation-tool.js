import { ANNOTATION_LAYER_ID, DRAWING_LAYER_ID } from '../config/constants.js';
import ol from '../lib/ol.js';
import { ensureAnnotationLayer } from '../map/layer-manager.js';
import { getLayerRecord, getMap, getState, removeLayerRecord, setAnnotationMode, setLayerRecord, setSelectedFeature, setSelectedTool } from '../state/store.js';
import { toggleSelectedLayerLabels } from './labels-tool.js';
import { showToast } from '../ui/toast.js';

let annotationMode = false;
let annotationClickListener = null;
let annotationContextMenuHandler = null;
let selectedAnnotationMode = null;
let selectedAnnotation = null;
let annotationMoveMode = false;
let annotationTranslateInteraction = null;
let annotationHoverMoveHandler = null;
let hoveredAnnotation = null;
const draggableAnnotations = new ol.Collection();
let drawingInteraction = null;
let selectedDrawingMode = null;
let drawStartHandler = null;
let drawEndHandler = null;
let drawingContextMenuHandler = null;
let drawingSelectionClickHandler = null;
let drawingHoverMoveHandler = null;
let drawingHoverTooltip = null;
let drawingHoverTooltipElement = null;
let selectedDrawing = null;
let hoveredDrawing = null;
let measureInteraction = null;
let measureLayer = null;
let measureTooltip = null;
let measureTooltipElement = null;
let measureHoverTooltip = null;
let measureHoverTooltipElement = null;
let measureHoverMoveHandler = null;
let measureSelectionClickHandler = null;
let measureSketchFeature = null;
let measureSketchListenerKey = null;
let measureContextMenuHandler = null;
let interactiveEscapeKeyHandler = null;
let selectedMeasurement = null;
let hoveredMeasurement = null;
let hasLatestMeasurementResult = false;
const DRAW_INTERACTION_KIND = 'drawing';
const MEASURE_INTERACTION_KIND = 'measurement';
const DRAWING_HIT_TOLERANCE_PX = 10;
const MEASUREMENT_HIT_TOLERANCE_PX = 6;
const MEASUREMENT_TYPE_DISTANCE = 'distance';
const MEASUREMENT_TYPE_AREA = 'area';
const DISTANCE_UNITS = ['m', 'km', 'mi', 'ft', 'nmi'];
const AREA_UNITS = ['m2', 'km2', 'ha', 'ac'];

function getSquaredDistance(first, second) {
    if (!Array.isArray(first) || !Array.isArray(second) || first.length < 2 || second.length < 2) {
        return Number.POSITIVE_INFINITY;
    }

    const deltaX = first[0] - second[0];
    const deltaY = first[1] - second[1];
    return (deltaX * deltaX) + (deltaY * deltaY);
}

const defaultMeasureStyle = [
    new ol.style.Style({
        fill: new ol.style.Fill({
            color: 'rgba(8, 145, 178, 0.16)'
        }),
        stroke: new ol.style.Stroke({
            color: 'rgba(255, 255, 255, 0.9)',
            width: 4.75,
            lineCap: 'round',
            lineJoin: 'round'
        })
    }),
    new ol.style.Style({
        fill: new ol.style.Fill({
            color: 'rgba(14, 116, 144, 0.2)'
        }),
        stroke: new ol.style.Stroke({
            color: 'rgba(15, 23, 42, 0.9)',
            width: 2.75,
            lineDash: [10, 6],
            lineCap: 'butt',
            lineJoin: 'round'
        }),
        image: new ol.style.Circle({
            radius: 4.5,
            fill: new ol.style.Fill({ color: '#f8fafc' }),
            stroke: new ol.style.Stroke({ color: '#0f172a', width: 2 })
        })
    })
];

const selectedMeasureStyle = [
    new ol.style.Style({
        fill: new ol.style.Fill({
            color: 'rgba(6, 182, 212, 0.2)'
        }),
        stroke: new ol.style.Stroke({
            color: 'rgba(255, 255, 255, 0.95)',
            width: 6
        })
    }),
    new ol.style.Style({
        fill: new ol.style.Fill({
            color: 'rgba(8, 145, 178, 0.24)'
        }),
        stroke: new ol.style.Stroke({
            color: 'rgba(22, 78, 99, 1)',
            width: 3.5,
            lineDash: [10, 6],
            lineCap: 'butt',
            lineJoin: 'round'
        }),
        image: new ol.style.Circle({
            radius: 6,
            fill: new ol.style.Fill({ color: '#ecfeff' }),
            stroke: new ol.style.Stroke({ color: '#155e75', width: 2.5 })
        })
    })
];

function createDrawingStyle() {
    return (feature) => {
        const isSelected = feature === selectedDrawing || feature.get('selectedDrawing');
        const isHovered = feature === hoveredDrawing || feature.get('hoveredDrawing');
        const fillColor = isSelected ? 'rgba(14, 165, 233, 0.22)' : 'rgba(37, 99, 235, 0.18)';
        const strokeColor = isSelected ? '#0e7490' : isHovered ? '#1d4ed8' : '#2563eb';
        const pointColor = isSelected ? '#0891b2' : isHovered ? '#1d4ed8' : '#2563eb';

        const styles = [];

        if (isSelected) {
            styles.push(new ol.style.Style({
                fill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.08)' }),
                stroke: new ol.style.Stroke({
                    color: 'rgba(255, 255, 255, 0.95)',
                    width: 7,
                    lineCap: 'round',
                    lineJoin: 'round'
                }),
                image: new ol.style.Circle({
                    radius: 10,
                    fill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.95)' }),
                    stroke: new ol.style.Stroke({ color: '#0e7490', width: 2 })
                })
            }));
        }

        styles.push(new ol.style.Style({
            fill: new ol.style.Fill({ color: fillColor }),
            stroke: new ol.style.Stroke({
                color: strokeColor,
                width: isSelected ? 3.5 : isHovered ? 3 : 2.5,
                lineCap: 'round',
                lineJoin: 'round'
            }),
            image: new ol.style.Circle({
                radius: isSelected ? 7.5 : isHovered ? 6.8 : 6,
                fill: new ol.style.Fill({ color: pointColor }),
                stroke: new ol.style.Stroke({ color: '#ffffff', width: isSelected ? 2.5 : 2 })
            })
        }));

        return styles;
    };
}

function ensureDrawingLayer() {
    const map = getMap();
    if (!map) {
        return null;
    }

    const existing = getLayerRecord(DRAWING_LAYER_ID);
    if (existing?.layer && existing?.source) {
        const layerSource = existing.layer.getSource();
        if (layerSource && layerSource === existing.source) {
            const alreadyOnMap = map.getLayers().getArray().includes(existing.layer);
            if (!alreadyOnMap) {
                map.addLayer(existing.layer);
            }
            return existing;
        }
    }

    if (existing?.layer) {
        map.removeLayer(existing.layer);
    }

    if (existing?.source) {
        existing.source.clear();
    }

    if (existing) {
        removeLayerRecord(DRAWING_LAYER_ID);
    }

    const source = new ol.source.Vector();
    const layer = new ol.layer.Vector({
        source,
        style: createDrawingStyle()
    });

    map.addLayer(layer);
    const record = { source, layer };
    setLayerRecord(DRAWING_LAYER_ID, record);
    return record;
}

function removeDrawInteraction(interaction) {
    if (!interaction) {
        return;
    }

    if (drawStartHandler) {
        interaction.un('drawstart', drawStartHandler);
        drawStartHandler = null;
    }

    if (drawEndHandler) {
        interaction.un('drawend', drawEndHandler);
        drawEndHandler = null;
    }

    const map = getMap();
    if (map) {
        map.removeInteraction(interaction);
    }
}

function detachDrawingContextMenuCancel() {
    const viewport = getMap()?.getViewport?.();
    if (!viewport || !drawingContextMenuHandler) {
        return;
    }

    viewport.removeEventListener('contextmenu', drawingContextMenuHandler);
    drawingContextMenuHandler = null;
}

function cancelActiveDrawingOperation() {
    if (!drawingInteraction || !selectedDrawingMode) {
        return false;
    }

    if (typeof drawingInteraction.abortDrawing === 'function') {
        drawingInteraction.abortDrawing();
    }

    deactivateDrawingMode();
    setSelectedTool(null);
    setAnnotationMode(null);
    showToast('Drawing Canceled', 'The drawing was canceled. Select a drawing tool to start again.', 'info', 1700);
    return true;
}

function cancelActiveDrawingByContextMenu(event) {
    if (!drawingInteraction || !selectedDrawingMode) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    cancelActiveDrawingOperation();
}

function attachDrawingContextMenuCancel() {
    const viewport = getMap()?.getViewport?.();
    if (!viewport || drawingContextMenuHandler) {
        return;
    }

    drawingContextMenuHandler = (event) => {
        cancelActiveDrawingByContextMenu(event);
    };
    viewport.addEventListener('contextmenu', drawingContextMenuHandler);
}

function clearAllDrawInteractions() {
    const map = getMap();
    if (!map) {
        drawingInteraction = null;
        return;
    }

    if (drawingInteraction) {
        removeDrawInteraction(drawingInteraction);
        drawingInteraction = null;
    }

    map.getInteractions().forEach((interaction) => {
        if (interaction instanceof ol.interaction.Draw && interaction.get('gpmapInteractionKind') === DRAW_INTERACTION_KIND) {
            map.removeInteraction(interaction);
        }
    });
}

function createMeasureStyle() {
    return (feature) => (feature === selectedMeasurement ? selectedMeasureStyle : defaultMeasureStyle);
}

function ensureMeasureLayer() {
    if (measureLayer) {
        return measureLayer;
    }

    const source = new ol.source.Vector();
    measureLayer = new ol.layer.Vector({
        source,
        style: createMeasureStyle()
    });
    getMap().addLayer(measureLayer);
    return measureLayer;
}

function removeMeasureTooltip() {
    const map = getMap();
    if (!map || !measureTooltip) {
        return;
    }

    map.removeOverlay(measureTooltip);
    measureTooltip = null;
    measureTooltipElement = null;
}

function removeMeasureHoverTooltip() {
    const map = getMap();
    if (!map || !measureHoverTooltip) {
        return;
    }

    map.removeOverlay(measureHoverTooltip);
    measureHoverTooltip = null;
    measureHoverTooltipElement = null;
}

function removeDrawingHoverTooltip() {
    const map = getMap();
    if (!map || !drawingHoverTooltip) {
        return;
    }

    map.removeOverlay(drawingHoverTooltip);
    drawingHoverTooltip = null;
    drawingHoverTooltipElement = null;
}

function canInspectMeasurements() {
    return !annotationMode && !selectedDrawingMode && !annotationMoveMode && !measureSketchFeature;
}

function canInspectDrawings() {
    return !annotationMode && !selectedDrawingMode && !annotationMoveMode && !measureInteraction && !measureSketchFeature;
}

function getDrawingAtPixel(pixel, options = {}) {
    const map = getMap();
    const drawingLayer = getLayerRecord(DRAWING_LAYER_ID);
    if (!map || !drawingLayer?.layer || !drawingLayer?.source) {
        return null;
    }

    const hitTolerance = options.hitTolerance ?? DRAWING_HIT_TOLERANCE_PX;
    const coordinate = map.getCoordinateFromPixel(pixel);
    const resolution = map.getView()?.getResolution?.() ?? 0;
    const toleranceInMapUnits = Math.max(resolution * hitTolerance, 0);
    const maxDistanceSquared = toleranceInMapUnits * toleranceInMapUnits;
    let hitDrawing = null;
    let bestFallback = null;
    let bestFallbackDistance = Number.POSITIVE_INFINITY;

    map.forEachFeatureAtPixel(pixel, (feature, layer) => {
        if (layer === drawingLayer.layer) {
            hitDrawing = feature;
            return true;
        }
        return false;
    }, {
        hitTolerance
    });

    if (hitDrawing || !coordinate || !resolution) {
        return hitDrawing;
    }

    drawingLayer.source.getFeatures().forEach((feature) => {
        const geometry = feature?.getGeometry?.();
        if (!geometry) {
            return;
        }

        if (geometry instanceof ol.geom.Polygon && geometry.intersectsCoordinate(coordinate)) {
            bestFallback = feature;
            bestFallbackDistance = 0;
            return;
        }

        const closestCoordinate = geometry.getClosestPoint?.(coordinate);
        const distanceSquared = getSquaredDistance(closestCoordinate, coordinate);
        if (distanceSquared <= maxDistanceSquared && distanceSquared < bestFallbackDistance) {
            bestFallback = feature;
            bestFallbackDistance = distanceSquared;
        }
    });

    return bestFallback;
}

function setSelectedDrawing(feature) {
    const drawingLayer = getLayerRecord(DRAWING_LAYER_ID);

    if (selectedDrawing && selectedDrawing !== feature) {
        selectedDrawing.set('selectedDrawing', false);
    }

    selectedDrawing = feature ?? null;
    if (selectedDrawing) {
        selectedDrawing.set('selectedDrawing', true);
        clearSelectedMeasurementContext();
        clearSelectedAnnotationContext();
    }

    if (drawingLayer?.layer) {
        drawingLayer.layer.changed();
    }

    updateDrawingControls();
    updateContextualInspectorVisibility();
}

function clearSelectedDrawingContext() {
    const drawingLayer = getLayerRecord(DRAWING_LAYER_ID);
    const clearedDrawing = selectedDrawing;
    if (selectedDrawing) {
        selectedDrawing.set('selectedDrawing', false);
        selectedDrawing = null;
    }

    if (getState().selectedFeature === clearedDrawing) {
        setSelectedFeature(null);
    }

    if (drawingLayer?.layer) {
        drawingLayer.layer.changed();
    }

    updateDrawingControls();
}

function updateDrawingHover(feature, coordinate = null) {
    const nextHoveredDrawing = feature ?? null;
    const drawingLayer = getLayerRecord(DRAWING_LAYER_ID);

    if (hoveredDrawing && hoveredDrawing !== selectedDrawing && hoveredDrawing !== nextHoveredDrawing) {
        hoveredDrawing.set('hoveredDrawing', false);
    }

    hoveredDrawing = nextHoveredDrawing;
    if (hoveredDrawing && hoveredDrawing !== selectedDrawing) {
        hoveredDrawing.set('hoveredDrawing', true);
    }

    if (drawingLayer?.layer) {
        drawingLayer.layer.changed();
    }

    if (hoveredDrawing && coordinate && canInspectDrawings()) {
        showDrawingHoverSummary(hoveredDrawing, coordinate);
    } else {
        hideDrawingHoverSummary();
    }

    syncMapCursor();
}

function isMeasurementGeometry(geometry) {
    return geometry instanceof ol.geom.LineString || geometry instanceof ol.geom.Polygon;
}

function getMeasuredFeatureAtPixel(pixel, options = {}) {
    const map = getMap();
    if (!map || !measureLayer) {
        return null;
    }

    let hitFeature = null;
    map.forEachFeatureAtPixel(pixel, (feature, layer) => {
        if (layer === measureLayer && isMeasurementGeometry(feature?.getGeometry?.())) {
            hitFeature = feature;
            return true;
        }
        return false;
    }, {
        hitTolerance: options.hitTolerance ?? MEASUREMENT_HIT_TOLERANCE_PX
    });

    return hitFeature;
}

function setSelectedMeasurement(feature) {
    if (selectedMeasurement === feature) {
        return;
    }

    selectedMeasurement = feature ?? null;
    hasLatestMeasurementResult = Boolean(selectedMeasurement);

    if (selectedMeasurement) {
        clearSelectedDrawingContext();
        clearSelectedAnnotationContext();
    } else {
        updateMeasurementResultPanel(Number.NaN);
    }

    if (measureLayer) {
        measureLayer.changed();
    }

    if (selectedMeasurement) {
        updateMeasurementResultPanel(getMeasurementValues(selectedMeasurement));
    } else {
        updateMeasurementControls();
    }

    updateContextualInspectorVisibility();
}

function clearSelectedMeasurementContext() {
    if (!selectedMeasurement && !hasLatestMeasurementResult) {
        updateMeasurementControls();
        return;
    }

    selectedMeasurement = null;
    hasLatestMeasurementResult = false;
    if (measureLayer) {
        measureLayer.changed();
    }
    updateMeasurementResultPanel(Number.NaN);
    updateMeasurementControls();
}

function clearSelectedAnnotationContext() {
    if (!selectedAnnotation) {
        updateAnnotationControls();
        return;
    }

    const clearedAnnotation = selectedAnnotation;
    selectedAnnotation.set('selected', false);
    selectedAnnotation = null;
    if (getState().selectedFeature === clearedAnnotation) {
        setSelectedFeature(null);
    }
    setMoveMode(false);
    syncDraggableAnnotations();
    updateAnnotationControls();
}

function updateContextualInspectorVisibility() {
    const inspector = document.querySelector('.contextual-inspector');
    if (!inspector) {
        return;
    }

    const hasVisibleContext = Array.from(inspector.children).some((child) => {
        return child instanceof HTMLElement && child.style.display !== 'none' && !child.hidden;
    });

    inspector.hidden = !hasVisibleContext;
}

function createMeasureTooltip() {
    const map = getMap();
    removeMeasureTooltip();

    measureTooltipElement = document.createElement('div');
    measureTooltipElement.className = 'measure-tooltip';
    measureTooltipElement.textContent = '0 m';

    measureTooltip = new ol.Overlay({
        element: measureTooltipElement,
        offset: [0, -12],
        positioning: 'bottom-center',
        stopEvent: false
    });

    map.addOverlay(measureTooltip);
}

function createMeasureHoverTooltip() {
    const map = getMap();
    if (!map || measureHoverTooltip) {
        return;
    }

    measureHoverTooltipElement = document.createElement('div');
    measureHoverTooltipElement.className = 'measure-tooltip measure-tooltip-hover';
    measureHoverTooltipElement.hidden = true;

    measureHoverTooltip = new ol.Overlay({
        element: measureHoverTooltipElement,
        offset: [0, -14],
        positioning: 'bottom-center',
        stopEvent: false
    });

    map.addOverlay(measureHoverTooltip);
}

function createDrawingHoverTooltip() {
    const map = getMap();
    if (!map || drawingHoverTooltip) {
        return;
    }

    drawingHoverTooltipElement = document.createElement('div');
    drawingHoverTooltipElement.className = 'measure-tooltip measure-tooltip-hover';
    drawingHoverTooltipElement.hidden = true;

    drawingHoverTooltip = new ol.Overlay({
        element: drawingHoverTooltipElement,
        offset: [0, -14],
        positioning: 'bottom-center',
        stopEvent: false
    });

    map.addOverlay(drawingHoverTooltip);
}

function formatMeasuredDistance(meters) {
    const safeMeters = Number.isFinite(meters) ? meters : 0;
    const unit = safeMeters >= 1000 ? 'km' : 'm';
    return formatDistanceForUnit(safeMeters, unit);
}

function getDistanceInUnit(meters, unit) {
    const safeMeters = Number.isFinite(meters) ? meters : 0;
    if (unit === 'km') {
        return safeMeters / 1000;
    }
    if (unit === 'mi') {
        return safeMeters / 1609.344;
    }
    if (unit === 'ft') {
        return safeMeters * 3.28084;
    }
    if (unit === 'nmi') {
        return safeMeters / 1852;
    }
    return safeMeters;
}

function formatDistanceForUnit(meters, unit) {
    const value = getDistanceInUnit(meters, unit);
    const absValue = Math.abs(value);
    const decimals = absValue >= 1000 ? 0 : absValue >= 100 ? 1 : 2;
    return `${formatNumberForDisplay(value, decimals)} ${unit}`;
}

function getAreaInUnit(squareMeters, unit) {
    const safeSquareMeters = Number.isFinite(squareMeters) ? squareMeters : 0;
    if (unit === 'km2') {
        return safeSquareMeters / 1000000;
    }
    if (unit === 'ha') {
        return safeSquareMeters / 10000;
    }
    if (unit === 'ac') {
        return safeSquareMeters / 4046.8564224;
    }
    return safeSquareMeters;
}

function getAreaUnitLabel(unit) {
    if (unit === 'm2') {
        return 'm²';
    }
    if (unit === 'km2') {
        return 'km²';
    }
    if (unit === 'ha') {
        return 'ha';
    }
    if (unit === 'ac') {
        return 'ac';
    }
    return unit;
}

function formatAreaForUnit(squareMeters, unit) {
    const value = getAreaInUnit(squareMeters, unit);
    const absValue = Math.abs(value);
    const decimals = absValue >= 1000 ? 0 : absValue >= 100 ? 1 : 2;
    return `${formatNumberForDisplay(value, decimals)} ${getAreaUnitLabel(unit)}`;
}

function formatMeasuredArea(squareMeters) {
    const safeSquareMeters = Number.isFinite(squareMeters) ? squareMeters : 0;
    if (safeSquareMeters >= 1000000) {
        return formatAreaForUnit(safeSquareMeters, 'km2');
    }
    if (safeSquareMeters >= 10000) {
        return formatAreaForUnit(safeSquareMeters, 'ha');
    }
    return formatAreaForUnit(safeSquareMeters, 'm2');
}

function formatNumberForDisplay(value, decimals) {
    const safeValue = Number.isFinite(value) ? value : 0;
    return safeValue.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function splitMeasurementValueParts(text) {
    const normalized = typeof text === 'string' ? text.trim() : '--';
    const separatorIndex = normalized.lastIndexOf(' ');
    if (separatorIndex <= 0 || normalized === '--') {
        return { value: normalized, unit: '' };
    }

    return {
        value: normalized.slice(0, separatorIndex),
        unit: normalized.slice(separatorIndex + 1)
    };
}

function setMeasurementCellValue(cell, text) {
    if (!cell) {
        return;
    }

    const { value, unit } = splitMeasurementValueParts(text);
    cell.replaceChildren();

    const valueSpan = document.createElement('span');
    valueSpan.className = 'measure-value-number';
    valueSpan.textContent = value;
    cell.appendChild(valueSpan);

    if (unit) {
        const unitSpan = document.createElement('span');
        unitSpan.className = 'measure-value-unit';
        unitSpan.textContent = unit;
        cell.appendChild(unitSpan);
    }
}

function getGeodesicLengthMeters(lineGeometry) {
    if (!lineGeometry || !getMap()?.getView()) {
        return 0;
    }

    const viewProjection = getMap().getView().getProjection();
    return ol.sphere.getLength(lineGeometry, { projection: viewProjection });
}

function getGeodesicAreaSquareMeters(polygonGeometry) {
    if (!polygonGeometry || !getMap()?.getView()) {
        return 0;
    }

    const viewProjection = getMap().getView().getProjection();
    return Math.abs(ol.sphere.getArea(polygonGeometry, { projection: viewProjection }));
}

function getPolygonPerimeterMeters(polygonGeometry) {
    const ringCoordinates = polygonGeometry?.getLinearRing?.(0)?.getCoordinates?.();
    if (!ringCoordinates?.length) {
        return 0;
    }

    return getGeodesicLengthMeters(new ol.geom.LineString(ringCoordinates));
}

function getMeasurementValues(featureOrGeometry) {
    const geometry = featureOrGeometry?.getGeometry?.() ?? featureOrGeometry;
    if (geometry instanceof ol.geom.Polygon) {
        return {
            type: MEASUREMENT_TYPE_AREA,
            areaSquareMeters: getGeodesicAreaSquareMeters(geometry),
            perimeterMeters: getPolygonPerimeterMeters(geometry)
        };
    }

    if (geometry instanceof ol.geom.LineString) {
        return {
            type: MEASUREMENT_TYPE_DISTANCE,
            lengthMeters: getGeodesicLengthMeters(geometry)
        };
    }

    return {
        type: MEASUREMENT_TYPE_DISTANCE,
        lengthMeters: 0
    };
}

function formatMeasurementSummary(featureOrGeometry) {
    const values = getMeasurementValues(featureOrGeometry);
    if (values.type === MEASUREMENT_TYPE_AREA) {
        return `Area: ${formatMeasuredArea(values.areaSquareMeters)}, Perimeter: ${formatMeasuredDistance(values.perimeterMeters)}`;
    }

    return `Distance: ${formatMeasuredDistance(values.lengthMeters)}`;
}

function formatCoordinateForDisplay(value) {
    return formatNumberForDisplay(value, 5);
}

function formatPointSummary(pointGeometry) {
    const projection = getMap()?.getView?.()?.getProjection?.();
    const coordinates = pointGeometry?.getCoordinates?.();
    if (!projection || !Array.isArray(coordinates)) {
        return 'Point';
    }

    const [longitude, latitude] = ol.proj.toLonLat(coordinates, projection);
    return `Point: lat ${formatCoordinateForDisplay(latitude)}, lon ${formatCoordinateForDisplay(longitude)}`;
}

function formatDrawingSummary(feature) {
    const geometry = feature?.getGeometry?.();
    const label = getDrawingLabel(feature);

    if (geometry instanceof ol.geom.Point) {
        return formatPointSummary(geometry);
    }

    if (geometry instanceof ol.geom.Polygon) {
        const areaSquareMeters = getGeodesicAreaSquareMeters(geometry);
        const perimeterMeters = getPolygonPerimeterMeters(geometry);
        return `${label}: Area ${formatMeasuredArea(areaSquareMeters)}, Perimeter ${formatMeasuredDistance(perimeterMeters)}`;
    }

    if (geometry instanceof ol.geom.LineString) {
        return `${label}: Length ${formatMeasuredDistance(getGeodesicLengthMeters(geometry))}`;
    }

    return label;
}

function hideDrawingHoverSummary() {
    if (drawingHoverTooltipElement) {
        drawingHoverTooltipElement.hidden = true;
    }
}

function showDrawingHoverSummary(feature, coordinate) {
    if (!drawingHoverTooltip || !drawingHoverTooltipElement || !feature || !coordinate) {
        return;
    }

    drawingHoverTooltipElement.textContent = formatDrawingSummary(feature);
    drawingHoverTooltipElement.hidden = false;
    drawingHoverTooltip.setPosition(coordinate);
}

function getMeasurementTooltipCoordinate(geometry) {
    if (geometry instanceof ol.geom.Polygon) {
        return geometry.getInteriorPoint().getCoordinates();
    }

    if (geometry instanceof ol.geom.LineString) {
        return geometry.getLastCoordinate();
    }

    return null;
}

function refreshMeasureTooltipForFeature(feature) {
    if (!feature || !measureTooltipElement || !measureTooltip) {
        return;
    }

    const geometry = feature.getGeometry();
    if (!isMeasurementGeometry(geometry)) {
        return;
    }

    if (feature.get?.('measurementType') === MEASUREMENT_TYPE_AREA) {
        measureTooltipElement.hidden = true;
        measureTooltip.setPosition(undefined);
        return;
    }

    measureTooltipElement.hidden = false;
    measureTooltipElement.textContent = formatMeasurementSummary(geometry);
    measureTooltip.setPosition(getMeasurementTooltipCoordinate(geometry));
}

function updateMeasurementResultPanel(measurement) {
    const panel = document.getElementById('measureResultsPanel');
    if (!panel) {
        return;
    }

    const values = typeof measurement === 'number'
        ? { type: MEASUREMENT_TYPE_DISTANCE, lengthMeters: measurement }
        : measurement;
    const hasMeasurement = Boolean(values && Number.isFinite(values.lengthMeters ?? values.areaSquareMeters));
    const measurementType = values?.type ?? MEASUREMENT_TYPE_DISTANCE;
    hasLatestMeasurementResult = hasMeasurement;

    panel.classList.toggle('empty', !hasMeasurement);
    panel.dataset.measurementType = hasMeasurement ? measurementType : 'none';

    const title = panel.querySelector('.measure-results-title-text');
    if (title) {
        title.textContent = 'Selected Measurement Result';
    }

    panel.querySelectorAll('[data-measure-section]').forEach((section) => {
        section.hidden = !hasMeasurement || section.dataset.measureSection !== measurementType;
    });

    DISTANCE_UNITS.forEach((unit) => {
        const cell = document.querySelector(`[data-measure-distance-value="${unit}"]`);
        if (cell) {
            setMeasurementCellValue(cell, hasMeasurement && measurementType === MEASUREMENT_TYPE_DISTANCE
                ? formatDistanceForUnit(values.lengthMeters, unit)
                : '--');
        }
    });

    AREA_UNITS.forEach((unit) => {
        const cell = document.querySelector(`[data-measure-area-value="${unit}"]`);
        if (cell) {
            setMeasurementCellValue(cell, hasMeasurement && measurementType === MEASUREMENT_TYPE_AREA
                ? formatAreaForUnit(values.areaSquareMeters, unit)
                : '--');
        }
    });

    DISTANCE_UNITS.forEach((unit) => {
        const cell = document.querySelector(`[data-measure-perimeter-value="${unit}"]`);
        if (cell) {
            setMeasurementCellValue(cell, hasMeasurement && measurementType === MEASUREMENT_TYPE_AREA
                ? formatDistanceForUnit(values.perimeterMeters, unit)
                : '--');
        }
    });

    updateMeasurementControls();
}

function updateMeasurementControls() {
    const contextPanel = document.getElementById('measurementContextPanel');
    const controls = document.getElementById('measurementSelectionControls');
    const deleteBtn = document.getElementById('deleteSelectedMeasurementBtn');
    const hint = document.querySelector('.measurement-selection-hint');
    const typeLabel = document.getElementById('selectedMeasurementType');

    if (!controls || !deleteBtn) {
        return;
    }

    if (contextPanel) {
        contextPanel.style.display = selectedMeasurement ? '' : 'none';
    }

    const resultTitle = document.querySelector('#measureResultsPanel .measure-results-title-text');
    if (resultTitle) {
        resultTitle.textContent = 'Selected Measurement Result';
    }

    if (selectedMeasurement) {
        const measurementType = selectedMeasurement.get?.('measurementType') === MEASUREMENT_TYPE_AREA
            ? 'Area'
            : 'Distance';
        controls.style.display = '';
        deleteBtn.disabled = false;
        if (typeLabel) {
            setTypeBadge(typeLabel, measurementType);
        }
        if (hint) {
            hint.textContent = 'Selected measurement is highlighted on the map. Delete removes only this measurement.';
        }
    } else {
        controls.style.display = 'none';
        deleteBtn.disabled = true;
        if (typeLabel) {
            typeLabel.textContent = 'None';
            delete typeLabel.dataset.badgeType;
        }
        if (hint) {
            hint.textContent = 'Click a measurement on the map to select it for individual deletion.';
        }
    }

    updateContextualInspectorVisibility();
}

function bindMeasurementHover() {
    const map = getMap();
    if (!map || measureHoverMoveHandler) {
        return;
    }

    createMeasureHoverTooltip();
    measureHoverMoveHandler = (event) => {
        if (!measureHoverTooltip || !measureHoverTooltipElement) {
            return;
        }

        if (!canInspectMeasurements()) {
            measureHoverTooltipElement.hidden = true;
            hoveredMeasurement = null;
            updateMeasurementCursor();
            return;
        }

        if (event.dragging) {
            measureHoverTooltipElement.hidden = true;
            hoveredMeasurement = null;
            updateMeasurementCursor();
            return;
        }

        if (hoveredDrawing) {
            measureHoverTooltipElement.hidden = true;
            hoveredMeasurement = null;
            updateMeasurementCursor();
            return;
        }

        const hitFeature = getMeasuredFeatureAtPixel(event.pixel);

        if (!hitFeature) {
            measureHoverTooltipElement.hidden = true;
            hoveredMeasurement = null;
            updateMeasurementCursor();
            return;
        }

        hoveredMeasurement = hitFeature;
        measureHoverTooltipElement.textContent = formatMeasurementSummary(hitFeature);
        measureHoverTooltipElement.hidden = false;
        measureHoverTooltip.setPosition(event.coordinate);
        updateMeasurementCursor({ hoveredFeature: hitFeature });
    };

    map.on('pointermove', measureHoverMoveHandler);
}

function bindMeasurementSelection() {
    const map = getMap();
    if (!map || measureSelectionClickHandler) {
        return;
    }

    measureSelectionClickHandler = (event) => {
        if (!canInspectMeasurements()) {
            return;
        }

        const hitFeature = getMeasuredFeatureAtPixel(event.pixel);

        if (!hitFeature) {
            setSelectedMeasurement(null);
            return;
        }

        setSelectedMeasurement(hitFeature);
        updateMeasurementResultPanel(getMeasurementValues(hitFeature));
    };

    map.on('singleclick', measureSelectionClickHandler);
}

function bindDrawingSelection() {
    const map = getMap();
    if (!map) {
        return;
    }

    createDrawingHoverTooltip();

    if (!drawingSelectionClickHandler) {
        drawingSelectionClickHandler = (event) => {
            if (!canInspectDrawings()) {
                return;
            }

            const previousDrawing = selectedDrawing;
            const hitDrawing = getDrawingAtPixel(event.pixel);
            setSelectedDrawing(hitDrawing);

            if (hitDrawing) {
                setSelectedFeature(hitDrawing);
            } else if (getState().selectedFeature === previousDrawing) {
                setSelectedFeature(null);
            }
        };

        map.on('singleclick', drawingSelectionClickHandler);
    }

    if (!drawingHoverMoveHandler) {
        drawingHoverMoveHandler = (event) => {
            if (event.dragging || !canInspectDrawings()) {
                updateDrawingHover(null);
                return;
            }

            updateDrawingHover(
                getDrawingAtPixel(event.pixel, { hitTolerance: DRAWING_HIT_TOLERANCE_PX + 2 }),
                event.coordinate
            );
        };

        map.on('pointermove', drawingHoverMoveHandler);
    }
}

function bindInteractiveEscapeKey() {
    if (interactiveEscapeKeyHandler) {
        return;
    }

    interactiveEscapeKeyHandler = (event) => {
        if (event.key !== 'Escape') {
            return;
        }

        if (cancelActiveDrawingOperation()
            || cancelActiveMeasurementOperation()
            || cancelActiveAnnotationOperation()
            || cancelActiveAnnotationMove()) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (selectedMeasurement) {
            setSelectedMeasurement(null);
            updateMeasurementCursor();
            updateMeasurementResultPanel(Number.NaN);
        }
    };

    window.addEventListener('keydown', interactiveEscapeKeyHandler);
}

function setMeasureButtonsActive(activeType = null) {
    const measureBtn = document.getElementById('measureDistanceBtn');
    if (measureBtn) {
        measureBtn.classList.toggle('active', activeType === MEASUREMENT_TYPE_DISTANCE);
    }

    const measureAreaBtn = document.getElementById('measureAreaBtn');
    if (measureAreaBtn) {
        measureAreaBtn.classList.toggle('active', activeType === MEASUREMENT_TYPE_AREA);
    }
}

function setTextAnnotationButtonActive(active) {
    const textAnnotationBtn = document.getElementById('addTextAnnotationBtn');
    if (textAnnotationBtn) {
        textAnnotationBtn.classList.toggle('active', active);
    }
}

function isTextAnnotationPlacementActive() {
    const state = getState();
    return annotationMode
        && selectedAnnotationMode === 'text'
        && state.annotationMode === 'text'
        && state.selectedTool === 'annotation:text'
        && !isDrawingActive()
        && !isMeasurementActive();
}

function detachAnnotationClickListener() {
    const map = getMap();
    if (map && annotationClickListener) {
        map.un('click', annotationClickListener);
    }
    annotationClickListener = null;
}

function clearMeasureSketchWatcher() {
    if (measureSketchListenerKey) {
        ol.Observable.unByKey(measureSketchListenerKey);
        measureSketchListenerKey = null;
    }
}

function teardownMeasureInteraction() {
    const map = getMap();
    if (map && measureInteraction) {
        map.removeInteraction(measureInteraction);
    }
    if (map) {
        map.getInteractions().forEach((interaction) => {
            if (interaction instanceof ol.interaction.Draw && interaction.get('gpmapInteractionKind') === MEASURE_INTERACTION_KIND) {
                map.removeInteraction(interaction);
            }
        });
    }
    clearMeasureSketchWatcher();
    measureSketchFeature = null;
    measureInteraction = null;
}

function deactivateMeasurementMode({ removeTooltip = true } = {}) {
    teardownMeasureInteraction();
    detachMeasurementContextMenuCancel();
    setMeasureButtonsActive(null);

    if (removeTooltip) {
        removeMeasureTooltip();
    }

    if (measureHoverTooltipElement) {
        measureHoverTooltipElement.hidden = true;
    }
    hoveredMeasurement = null;
    updateMeasurementCursor();
}

function detachMeasurementContextMenuCancel() {
    const viewport = getMap()?.getViewport?.();
    if (!viewport || !measureContextMenuHandler) {
        return;
    }

    viewport.removeEventListener('contextmenu', measureContextMenuHandler);
    measureContextMenuHandler = null;
}

function cancelActiveMeasurementOperation() {
    if (!measureInteraction || !getState().selectedTool?.startsWith?.('measurement:')) {
        return false;
    }

    if (typeof measureInteraction.abortDrawing === 'function') {
        measureInteraction.abortDrawing();
    }

    clearMeasureSketchWatcher();
    measureSketchFeature = null;
    deactivateMeasurementMode();
    setSelectedTool(null);
    setAnnotationMode(null);
    showToast('Measurement Canceled', 'The measurement was canceled. Select a measurement tool to start again.', 'info', 1700);
    return true;
}

function cancelActiveMeasurementByContextMenu(event) {
    if (!measureInteraction || !getState().selectedTool?.startsWith?.('measurement:')) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    cancelActiveMeasurementOperation();
}

function attachMeasurementContextMenuCancel() {
    const viewport = getMap()?.getViewport?.();
    if (!viewport || measureContextMenuHandler) {
        return;
    }

    measureContextMenuHandler = (event) => {
        cancelActiveMeasurementByContextMenu(event);
    };
    viewport.addEventListener('contextmenu', measureContextMenuHandler);
}

function deactivateDrawingMode() {
    clearAllDrawInteractions();
    detachDrawingContextMenuCancel();
    selectedDrawingMode = null;

    const drawingButtons = document.querySelectorAll('[data-draw-mode]');
    drawingButtons.forEach((button) => button.classList.remove('active'));
}

function getDrawConfig(type) {
    if (type === 'point') {
        return { drawType: 'Point', freehand: false, label: 'Point' };
    }

    if (type === 'line') {
        return { drawType: 'LineString', freehand: false, label: 'Line' };
    }

    if (type === 'polygon') {
        return { drawType: 'Polygon', freehand: false, label: 'Polygon' };
    }

    if (type === 'freehand') {
        return { drawType: 'LineString', freehand: true, label: 'Freehand' };
    }

    return null;
}

function syncDraggableAnnotations() {
    draggableAnnotations.clear();

    if (selectedAnnotation?.get('isAnnotation')) {
        draggableAnnotations.push(selectedAnnotation);
    }
}

function getAnnotationAtPixel(pixel) {
    if (!getMap()) {
        return null;
    }

    let hitAnnotation = null;
    getMap().forEachFeatureAtPixel(pixel, (feature) => {
        if (feature?.get('isAnnotation')) {
            hitAnnotation = feature;
            return true;
        }
        return false;
    }, {
        hitTolerance: 8
    });

    return hitAnnotation;
}

function syncMapCursor() {
    const viewport = getMap()?.getViewport?.();
    if (!viewport) {
        return;
    }

    if (annotationMoveMode) {
        viewport.style.cursor = 'grab';
        return;
    }

    if (hoveredAnnotation?.get?.('isAnnotation')) {
        viewport.style.cursor = 'pointer';
        return;
    }

    if (hoveredDrawing && canInspectDrawings()) {
        viewport.style.cursor = 'pointer';
        return;
    }

    if (annotationMode && selectedAnnotationMode === 'text') {
        viewport.style.cursor = 'crosshair';
        return;
    }

    if (isMeasurementGeometry(hoveredMeasurement?.getGeometry?.()) && canInspectMeasurements()) {
        viewport.style.cursor = 'pointer';
        return;
    }

    viewport.style.cursor = '';
}

function updateAnnotationCursor({ hoveredAnnotation: nextHoveredAnnotation = null } = {}) {
    hoveredAnnotation = nextHoveredAnnotation?.get?.('isAnnotation') ? nextHoveredAnnotation : null;
    syncMapCursor();
}

function updateMeasurementCursor({ hoveredFeature = null } = {}) {
    if (annotationMoveMode || (annotationMode && selectedAnnotationMode === 'text')) {
        return;
    }

    hoveredMeasurement = isMeasurementGeometry(hoveredFeature?.getGeometry?.()) ? hoveredFeature : hoveredMeasurement;
    syncMapCursor();
}

function selectAnnotationFeature(feature) {
    if (selectedAnnotation) {
        selectedAnnotation.set('selected', false);
    }

    selectedAnnotation = feature?.get?.('isAnnotation') ? feature : null;
    setSelectedFeature(selectedAnnotation);
    syncDraggableAnnotations();

    if (selectedAnnotation) {
        clearSelectedDrawingContext();
        clearSelectedMeasurementContext();
        selectedAnnotation.set('selected', true);
    }

    if (!selectedAnnotation) {
        setMoveMode(false);
    } else if (annotationMoveMode) {
        setMoveMode(true);
    }

    updateAnnotationControls();
    updateContextualInspectorVisibility();
}

function setMoveMode(enabled) {
    annotationMoveMode = enabled && !!selectedAnnotation;

    if (annotationTranslateInteraction) {
        annotationTranslateInteraction.setActive(annotationMoveMode);
    }

    const moveBtn = document.getElementById('moveAnnotationBtn');
    if (moveBtn) {
        moveBtn.classList.toggle('active', annotationMoveMode);
    }

    updateAnnotationCursor();
    updateAnnotationControls();

    if (annotationMoveMode) {
        attachAnnotationContextMenuCancel();
    } else if (!isTextAnnotationPlacementActive()) {
        detachAnnotationContextMenuCancel();
    }
}

export function initializeAnnotationInteractions() {
    if (annotationTranslateInteraction || !getMap()) {
        return;
    }

    annotationTranslateInteraction = new ol.interaction.Translate({
        features: draggableAnnotations
    });
    annotationTranslateInteraction.setActive(false);

    annotationTranslateInteraction.on('translatestart', () => {
        const viewport = getMap()?.getViewport();
        if (viewport) {
            viewport.style.cursor = 'grabbing';
        }
    });

    annotationTranslateInteraction.on('translateend', () => {
        ensureAnnotationLayer().layer.changed();
        setMoveMode(false);
    });

    getMap().addInteraction(annotationTranslateInteraction);

    if (!annotationHoverMoveHandler) {
        annotationHoverMoveHandler = (event) => {
            if (event.dragging || annotationMoveMode) {
                return;
            }

            const hoveredAnnotation = getAnnotationAtPixel(event.pixel);
            updateAnnotationCursor({ hoveredAnnotation });
        };

        getMap().on('pointermove', annotationHoverMoveHandler);
    }
}

function resetAnnotationPlacement() {
    detachAnnotationClickListener();

    annotationMode = false;
    selectedAnnotationMode = null;
    setAnnotationMode(null);
    setSelectedTool(null);
    setTextAnnotationButtonActive(false);
    updateAnnotationCursor();

    detachAnnotationContextMenuCancel();
}

function detachAnnotationContextMenuCancel() {
    const viewport = getMap()?.getViewport?.();
    if (!viewport || !annotationContextMenuHandler) {
        return;
    }

    viewport.removeEventListener('contextmenu', annotationContextMenuHandler);
    annotationContextMenuHandler = null;
}

function clearAnnotationPlacementPopup() {
    const popup = document.getElementById('annotationPopup');
    if (popup) {
        popup.classList.remove('active');
    }

    const input = document.getElementById('annotationInput');
    if (input) {
        input.value = '';
        delete input.dataset.x;
        delete input.dataset.y;
    }
}

function cancelActiveAnnotationOperation() {
    if (!annotationMode || selectedAnnotationMode !== 'text') {
        return false;
    }

    clearAnnotationPlacementPopup();
    resetAnnotationPlacement();
    updateAnnotationControls();
    showToast('Annotation Canceled', 'Text annotation placement was canceled. Click Add Text Annotation to start again.', 'info', 1700);
    return true;
}

function cancelActiveAnnotationMove() {
    if (!annotationMoveMode) {
        return false;
    }

    setMoveMode(false);
    showToast('Annotation Move Canceled', 'Annotation move mode was turned off.', 'info', 1500);
    return true;
}

function cancelActiveAnnotationByContextMenu(event) {
    if (!annotationMode && !annotationMoveMode) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    cancelActiveAnnotationOperation() || cancelActiveAnnotationMove();
}

function attachAnnotationContextMenuCancel() {
    const viewport = getMap()?.getViewport?.();
    if (!viewport || annotationContextMenuHandler) {
        return;
    }

    annotationContextMenuHandler = (event) => {
        cancelActiveAnnotationByContextMenu(event);
    };
    viewport.addEventListener('contextmenu', annotationContextMenuHandler);
}

export function getSelectedAnnotationMode() {
    return selectedAnnotationMode;
}

export function activateAnnotation(type) {
    if (type === 'text') {
        detachAnnotationClickListener();
        deactivateMeasurementMode();
        deactivateDrawingMode();
        setMoveMode(false);
        selectedAnnotationMode = 'text';
        annotationMode = true;
        setAnnotationMode('text');
        setSelectedTool('annotation:text');
        setTextAnnotationButtonActive(true);
        updateAnnotationCursor();
        attachAnnotationContextMenuCancel();
        const placementClickListener = (event) => {
            if (annotationClickListener !== placementClickListener || !isTextAnnotationPlacementActive()) {
                return;
            }

            const existingAnnotation = getAnnotationAtPixel(event.pixel);
            if (existingAnnotation) {
                document.getElementById('annotationPopup')?.classList.remove('active');
                resetAnnotationPlacement();
                selectAnnotationFeature(existingAnnotation);
                return;
            }

            const coordinates = event.coordinate;
            const popup = document.getElementById('annotationPopup');
            const pixel = getMap().getPixelFromCoordinate(coordinates);

            popup.style.left = `${pixel[0] + 10}px`;
            popup.style.top = `${pixel[1] - 50}px`;
            popup.classList.add('active');

            const input = document.getElementById('annotationInput');
            input.focus();
            input.dataset.x = coordinates[0];
            input.dataset.y = coordinates[1];

            // Match the measure workflow: one placement per activation.
            resetAnnotationPlacement();
        };

        annotationClickListener = placementClickListener;
        getMap().on('click', annotationClickListener);
        return;
    }

    if (type === 'labels') {
        resetAnnotationPlacement();
        deactivateMeasurementMode();
        deactivateDrawingMode();
        setMoveMode(false);
        selectedAnnotationMode = null;
        setAnnotationMode(null);
        setSelectedTool('annotation:labels');
        setTextAnnotationButtonActive(false);
        toggleSelectedLayerLabels();
        updateAnnotationCursor();
    }
}

export function activateDrawing(type) {
    const config = getDrawConfig(type);
    if (!config || !getMap()) {
        return;
    }

    if (selectedDrawingMode === type) {
        deactivateDrawingMode();
        setSelectedTool(null);
        setAnnotationMode(null);
        showToast('Drawing Disabled', `${config.label} drawing mode was turned off.`, 'info', 1500);
        return;
    }

    cancelAnnotation();
    deactivateMeasurementMode();
    setMoveMode(false);
    deactivateDrawingMode();

    const drawingLayer = ensureDrawingLayer();
    if (!drawingLayer?.source) {
        showToast('Drawing Unavailable', 'The drawing layer is not ready yet.', 'error', 2200);
        return;
    }
    drawingInteraction = new ol.interaction.Draw({
        source: drawingLayer.source,
        type: config.drawType,
        freehand: config.freehand,
        stopClick: true
    });
    drawingInteraction.set('gpmapInteractionKind', DRAW_INTERACTION_KIND);

    drawStartHandler = () => {
        selectedAnnotation = null;
        setSelectedDrawing(null);
        setSelectedFeature(null);
        updateAnnotationControls();
    };
    drawingInteraction.on('drawstart', drawStartHandler);

    drawEndHandler = (event) => {
        if (event.feature) {
            event.feature.set('drawingType', type);
        }
        drawingLayer.layer.changed();
    };
    drawingInteraction.on('drawend', drawEndHandler);

    getMap().addInteraction(drawingInteraction);
    attachDrawingContextMenuCancel();
    selectedDrawingMode = type;
    setSelectedTool(`drawing:${type}`);
    setAnnotationMode(null);

    const drawingButtons = document.querySelectorAll('[data-draw-mode]');
    drawingButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.drawMode === type);
    });

    const drawMessage = config.freehand
        ? 'Drag on the map to sketch a freehand line. Release the pointer to finish each stroke.'
        : config.drawType === 'Point'
            ? 'Click on the map to place a point.'
            : 'Click to place vertices, then double-click to finish.';
    showToast(`${config.label} Drawing Ready`, drawMessage, 'info', 2200);
}

function getDrawingLabel(feature) {
    const geometry = feature?.getGeometry?.();
    const type = feature?.get?.('drawingType');

    if (type === 'freehand') {
        return 'Freehand';
    }
    if (geometry instanceof ol.geom.Point) {
        return 'Point';
    }
    if (geometry instanceof ol.geom.Polygon) {
        return 'Polygon';
    }
    if (geometry instanceof ol.geom.LineString) {
        return 'Line';
    }
    return 'Drawing';
}

function setTypeBadge(labelElement, value) {
    if (!labelElement) {
        return;
    }

    labelElement.textContent = value;
    labelElement.dataset.badgeType = value.toLowerCase();
}

export function updateDrawingControls() {
    const controls = document.getElementById('drawingSelectionControls');
    const deleteBtn = document.getElementById('deleteSelectedDrawingBtn');
    const hint = document.querySelector('.drawing-selection-hint');
    const typeLabel = document.getElementById('selectedDrawingType');

    if (!controls || !deleteBtn) {
        return;
    }

    if (selectedDrawing) {
        controls.style.display = '';
        deleteBtn.disabled = false;
        if (typeLabel) {
            setTypeBadge(typeLabel, getDrawingLabel(selectedDrawing));
        }
        if (hint) {
            hint.textContent = 'Selected drawing is highlighted on the map. Delete removes only this drawing.';
        }
    } else {
        controls.style.display = 'none';
        deleteBtn.disabled = true;
        if (typeLabel) {
            typeLabel.textContent = 'None';
            delete typeLabel.dataset.badgeType;
        }
        if (hint) {
            hint.textContent = 'Click a drawing on the map to select it for individual deletion.';
        }
    }

    updateContextualInspectorVisibility();
}

export function deleteSelectedDrawing() {
    const drawingLayer = getLayerRecord(DRAWING_LAYER_ID);
    if (!drawingLayer?.source || !selectedDrawing) {
        showToast('No Drawing Selected', 'Select a drawing on the map before using Delete Selected Drawing.', 'info', 1700);
        return;
    }

    const deletedLabel = getDrawingLabel(selectedDrawing);
    const deletedDrawing = selectedDrawing;
    drawingLayer.source.removeFeature(selectedDrawing);
    selectedDrawing = null;
    hoveredDrawing = null;
    hideDrawingHoverSummary();
    if (getState().selectedFeature === deletedDrawing) {
        setSelectedFeature(null);
    }
    drawingLayer.layer.changed();
    updateDrawingControls();
    syncMapCursor();
    showToast('Drawing Deleted', `${deletedLabel} drawing was removed. Other drawings were kept.`, 'success', 1700);
}

export function clearDrawings() {
    const drawingLayer = getLayerRecord(DRAWING_LAYER_ID);
    if (!drawingLayer?.source) {
        showToast('No Drawings', 'There are no drawings to clear.', 'info', 1500);
        return;
    }

    drawingLayer.source.clear();
    const clearedDrawing = selectedDrawing;
    selectedDrawing = null;
    hoveredDrawing = null;
    hideDrawingHoverSummary();
    if (getState().selectedFeature === clearedDrawing) {
        setSelectedFeature(null);
    }
    drawingLayer.layer.changed();
    updateDrawingControls();
    syncMapCursor();
    showToast('Drawings Cleared', 'All drawings were removed.', 'success', 1700);
}

function activateMeasurementTool(type) {
    const map = getMap();
    if (!map) {
        return;
    }

    if (measureInteraction) {
        const activeTool = getState().selectedTool;
        deactivateMeasurementMode();
        setSelectedTool(null);
        const wasSameTool = activeTool === `measurement:${type}`;
        if (wasSameTool) {
            showToast('Measurement Disabled', `${type === MEASUREMENT_TYPE_AREA ? 'Area' : 'Distance'} measurement mode was turned off.`, 'info', 1500);
            return;
        }
    }

    if (type !== MEASUREMENT_TYPE_DISTANCE && type !== MEASUREMENT_TYPE_AREA) {
        return;
    }

    cancelAnnotation();
    setMoveMode(false);
    deactivateDrawingMode();

    const layer = ensureMeasureLayer();
    if (!layer?.getSource()) {
        showToast('Measurement Unavailable', 'The measurement layer is not ready yet.', 'error', 2200);
        return;
    }

    createMeasureTooltip();
    bindMeasurementHover();
    measureInteraction = new ol.interaction.Draw({
        source: layer.getSource(),
        type: type === MEASUREMENT_TYPE_AREA ? 'Polygon' : 'LineString',
        stopClick: true
    });
    measureInteraction.set('gpmapInteractionKind', MEASURE_INTERACTION_KIND);
    measureInteraction.set('measurementType', type);

    measureInteraction.on('drawstart', (event) => {
        measureSketchFeature = event.feature;
        event.feature.set('measurementType', type);
        clearMeasureSketchWatcher();
        if (type === MEASUREMENT_TYPE_AREA) {
            if (measureTooltipElement) {
                measureTooltipElement.hidden = true;
            }
            if (measureTooltip) {
                measureTooltip.setPosition(undefined);
            }
            return;
        }

        measureSketchListenerKey = event.feature.getGeometry().on('change', (geometryEvent) => {
            refreshMeasureTooltipForFeature({
                get: (key) => (key === 'measurementType' ? type : undefined),
                getGeometry: () => geometryEvent.target
            });
        });
    });

    measureInteraction.on('drawend', (event) => {
        const measuredGeometry = event.feature?.getGeometry();
        if (isMeasurementGeometry(measuredGeometry)) {
            event.feature.set('measurementType', type);
            setSelectedMeasurement(event.feature);
            updateMeasurementResultPanel(getMeasurementValues(event.feature));
        }
        clearMeasureSketchWatcher();
        measureSketchFeature = null;
        deactivateMeasurementMode();
        setSelectedTool(null);
        showToast(
            'Measurement Complete',
            type === MEASUREMENT_TYPE_AREA
                ? 'Area recorded. Click Measure Area again to start a new polygon.'
                : 'Distance recorded. Click Measure Distance again to start a new line.',
            'success',
            1800
        );
    });

    map.addInteraction(measureInteraction);
    attachMeasurementContextMenuCancel();
    setSelectedTool(`measurement:${type}`);
    setAnnotationMode(null);
    setMeasureButtonsActive(type);

    showToast(
        type === MEASUREMENT_TYPE_AREA ? 'Area Measurement Ready' : 'Distance Measurement Ready',
        type === MEASUREMENT_TYPE_AREA
            ? 'Click on the map to start an area measurement. Add vertices, then double-click to finish.'
            : 'Click on the map to start a distance measurement. Click to add vertices, then double-click to finish.',
        'info',
        2300
    );
}

export function activateMeasureDistance() {
    activateMeasurementTool(MEASUREMENT_TYPE_DISTANCE);
}

export function activateMeasureArea() {
    activateMeasurementTool(MEASUREMENT_TYPE_AREA);
}

export function clearMeasurements() {
    if (!measureLayer?.getSource()) {
        showToast('No Measurements', 'There are no measurements to clear.', 'info', 1500);
        return;
    }

    measureLayer.getSource().clear();
    setSelectedMeasurement(null);
    hoveredMeasurement = null;
    createMeasureTooltip();
    if (measureHoverTooltipElement) {
        measureHoverTooltipElement.hidden = true;
    }
    updateMeasurementCursor();
    updateMeasurementResultPanel(Number.NaN);
    showToast('Measurements Cleared', 'All measurements were removed.', 'success', 1600);
}

export function deleteSelectedMeasurement() {
    if (!measureLayer?.getSource() || !selectedMeasurement) {
        showToast('No Measurement Selected', 'Select a distance or area measurement before using Delete Selected Measurement.', 'info', 1700);
        return;
    }

    const deletedMeasurement = selectedMeasurement;
    const measurementType = deletedMeasurement.get?.('measurementType') === MEASUREMENT_TYPE_AREA ? 'Area' : 'Distance';
    measureLayer.getSource().removeFeature(deletedMeasurement);
    setSelectedMeasurement(null);
    hoveredMeasurement = null;
    if (measureHoverTooltipElement) {
        measureHoverTooltipElement.hidden = true;
    }
    updateMeasurementCursor();
    updateMeasurementResultPanel(Number.NaN);
    showToast('Measurement Deleted', `${measurementType} measurement was removed. Other measurements were kept.`, 'success', 1700);
}

export function isMeasurementActive() {
    return Boolean(measureInteraction);
}

export function isDrawingActive() {
    return Boolean(drawingInteraction && selectedDrawingMode);
}

export function submitAnnotation() {
    const input = document.getElementById('annotationInput');
    const text = input.value.trim();
    const x = parseFloat(input.dataset.x);
    const y = parseFloat(input.dataset.y);
    const fontSize = parseInt(document.getElementById('annotationFontSize').value, 10) || 12;
    const fontColor = document.getElementById('annotationFontColor').value || '#000000';
    const annotationsVisible = document.getElementById('annotationsToggle')?.checked !== false;

    if (!text) {
        showToast('Annotation Required', 'Enter some text for the annotation.', 'warning');
        return;
    }

    const feature = new ol.Feature({
        geometry: new ol.geom.Point([x, y]),
        text,
        fontSize,
        fontColor,
        isAnnotation: true,
        annotationVisible: annotationsVisible,
        isDragging: false
    });

    ensureAnnotationLayer().source.addFeature(feature);
    resetAnnotationPlacement();

    document.getElementById('annotationPopup').classList.remove('active');
    input.value = '';
    delete input.dataset.x;
    delete input.dataset.y;

    updateAnnotationControls();
}

export function cancelAnnotation() {
    clearAnnotationPlacementPopup();

    resetAnnotationPlacement();
    updateAnnotationControls();
}

export function editAnnotation(feature) {
    if (!feature) {
        return;
    }

    setMoveMode(false);

    const text = feature.get('text');
    const fontSize = feature.get('fontSize') || 12;
    const fontColor = feature.get('fontColor') || '#000000';
    const editPopup = document.createElement('div');

    editPopup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        z-index: 10001;
        min-width: 300px;
    `;

    editPopup.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 15px; font-size: 14px;">Edit Annotation</div>
        <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px;">Text</label>
            <textarea id="editAnnotationText" style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px; font-family: Arial; font-size: 13px; min-height: 60px; resize: vertical;">${text}</textarea>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
            <div>
                <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px;">Font Size</label>
                <input type="number" id="editAnnotationFontSize" min="8" max="48" value="${fontSize}" style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px; font-size: 13px;">
            </div>
            <div>
                <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px;">Color</label>
                <input type="color" id="editAnnotationFontColor" value="${fontColor}" style="width: 100%; height: 36px; padding: 4px; border: 1px solid var(--gray-300); border-radius: 6px; cursor: pointer;">
            </div>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="editCancelBtn" style="padding: 8px 16px; background: var(--gray-200); border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">Cancel</button>
            <button id="editSaveBtn" style="padding: 8px 16px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">Save</button>
        </div>
    `;

    document.body.appendChild(editPopup);

    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.3);
        z-index: 10000;
    `;
    document.body.insertBefore(backdrop, editPopup);

    document.getElementById('editSaveBtn').onclick = () => {
        const newText = document.getElementById('editAnnotationText').value.trim();
        const newFontSize = parseInt(document.getElementById('editAnnotationFontSize').value, 10) || 12;
        const newFontColor = document.getElementById('editAnnotationFontColor').value;

        if (!newText) {
            showToast('Annotation Required', 'Enter some text for the annotation.', 'warning');
            return;
        }

        feature.set('text', newText);
        feature.set('fontSize', newFontSize);
        feature.set('fontColor', newFontColor);

        ensureAnnotationLayer().layer.changed();
        updateAnnotationControls();
        backdrop.remove();
        editPopup.remove();
    };

    document.getElementById('editCancelBtn').onclick = () => {
        backdrop.remove();
        editPopup.remove();
    };
}

export function deleteAnnotation(feature) {
    const annotationLayer = getLayerRecord(ANNOTATION_LAYER_ID);
    if (!annotationLayer) {
        return;
    }

    setMoveMode(false);
    annotationLayer.source.removeFeature(feature);
    selectedAnnotation = null;
    setSelectedFeature(null);
    syncDraggableAnnotations();

    updateAnnotationControls();

    if (annotationLayer.source.getFeatures().length === 0) {
        getMap().removeLayer(annotationLayer.layer);
        removeLayerRecord(ANNOTATION_LAYER_ID);
    }
}

export function clearAnnotations() {
    const annotationLayer = getLayerRecord(ANNOTATION_LAYER_ID);
    if (!annotationLayer?.source) {
        showToast('No Annotations', 'There are no text annotations to clear.', 'info', 1500);
        return;
    }

    const annotationCount = annotationLayer.source.getFeatures().filter((feature) => feature.get('isAnnotation')).length;
    if (annotationCount === 0) {
        showToast('No Annotations', 'There are no text annotations to clear.', 'info', 1500);
        return;
    }

    setMoveMode(false);
    annotationLayer.source.clear();
    selectedAnnotation = null;
    hoveredAnnotation = null;
    setSelectedFeature(null);
    syncDraggableAnnotations();
    updateAnnotationCursor();
    updateAnnotationControls();

    const map = getMap();
    if (map) {
        map.removeLayer(annotationLayer.layer);
    }
    removeLayerRecord(ANNOTATION_LAYER_ID);
    showToast('Annotations Cleared', 'All text annotations were removed.', 'success', 1700);
}

export function selectAnnotationForDeletion(event) {
    if (annotationMoveMode || isDrawingActive() || isMeasurementActive()) {
        return;
    }

    selectAnnotationFeature(getAnnotationAtPixel(event.pixel));
}

export function updateAnnotationControls() {
    const controls = document.getElementById('annotationControls');
    const editBtn = document.getElementById('editAnnotationBtn');
    const deleteBtn = document.getElementById('deleteAnnotationBtn');
    const moveBtn = document.getElementById('moveAnnotationBtn');
    const visibilityBtn = document.getElementById('toggleAnnotationVisibilityBtn');
    const clearBtn = document.getElementById('clearAnnotationsBtn');
    const hint = document.querySelector('.annotation-controls-hint');

    if (!controls || !editBtn || !deleteBtn || !moveBtn) {
        return;
    }

    if (selectedAnnotation) {
        const annotationVisible = selectedAnnotation.get('annotationVisible') !== false;
        controls.style.display = '';
        editBtn.disabled = false;
        deleteBtn.disabled = false;
        moveBtn.disabled = false;
        if (clearBtn) {
            clearBtn.disabled = false;
        }
        if (visibilityBtn) {
            visibilityBtn.disabled = false;
            visibilityBtn.classList.toggle('active', !annotationVisible);
            visibilityBtn.dataset.state = annotationVisible ? 'visible' : 'hidden';
            visibilityBtn.setAttribute('aria-pressed', annotationVisible ? 'false' : 'true');
            visibilityBtn.innerHTML = annotationVisible
                ? '<i class="fas fa-eye-slash"></i> Hide'
                : '<i class="fas fa-eye"></i> Show';
            visibilityBtn.title = annotationVisible
                ? 'Hide the selected annotation text'
                : 'Show the selected annotation text';
        }
        if (hint) {
            if (annotationMoveMode) {
                hint.textContent = 'Drag the selected annotation on the map. Click Move again to finish repositioning.';
            } else {
                hint.textContent = annotationVisible
                    ? 'Selected annotation is visible. Use Hide to keep its anchor and remove the text from view.'
                    : 'Selected annotation text is hidden. Use Show to restore it.';
            }
        }
    } else {
        controls.style.display = 'none';
        editBtn.disabled = true;
        deleteBtn.disabled = true;
        moveBtn.disabled = true;
        if (clearBtn) {
            clearBtn.disabled = true;
        }
        if (visibilityBtn) {
            visibilityBtn.disabled = true;
            visibilityBtn.classList.remove('active');
            visibilityBtn.dataset.state = 'visible';
            visibilityBtn.setAttribute('aria-pressed', 'false');
            visibilityBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide';
            visibilityBtn.title = 'Hide or show the selected annotation text';
        }
        if (hint) {
            hint.textContent = 'Select an annotation on the map to edit its text, move its position, or remove it.';
        }
    }

    const annotationLayer = getLayerRecord(ANNOTATION_LAYER_ID);
    if (annotationLayer) {
        annotationLayer.source.getFeatures().forEach((feature) => {
            feature.set('selected', feature === selectedAnnotation);
        });
        annotationLayer.layer.changed();
    }

    updateContextualInspectorVisibility();
}

export function bindAnnotationControls() {
    const editBtn = document.getElementById('editAnnotationBtn');
    const deleteBtn = document.getElementById('deleteAnnotationBtn');
    const moveBtn = document.getElementById('moveAnnotationBtn');
    const visibilityBtn = document.getElementById('toggleAnnotationVisibilityBtn');
    const clearBtn = document.getElementById('clearAnnotationsBtn');

    if (editBtn) {
        editBtn.onclick = () => {
            if (selectedAnnotation) {
                editAnnotation(selectedAnnotation);
            }
        };
    }

    if (deleteBtn) {
        deleteBtn.onclick = () => {
            if (selectedAnnotation) {
                deleteAnnotation(selectedAnnotation);
                selectedAnnotation = null;
                updateAnnotationControls();
            }
        };
    }

    if (moveBtn) {
        moveBtn.onclick = () => {
            if (!selectedAnnotation) {
                return;
            }

            const nextMoveMode = !annotationMoveMode;
            setMoveMode(nextMoveMode);
        };
    }

    if (visibilityBtn) {
        visibilityBtn.onclick = () => {
            if (!selectedAnnotation) {
                return;
            }

            const nextVisible = selectedAnnotation.get('annotationVisible') === false;
            selectedAnnotation.set('annotationVisible', nextVisible);
            ensureAnnotationLayer().layer.changed();
            updateAnnotationControls();
            showToast(
                nextVisible ? 'Annotation Shown' : 'Annotation Hidden',
                nextVisible
                    ? 'The selected annotation text is visible again.'
                    : 'The text is hidden, but its map anchor remains selectable.',
                'info',
                1800
            );
        };
    }

    if (clearBtn) {
        clearBtn.onclick = () => {
            clearAnnotations();
        };
    }
}

export function initializeDrawingSelectionControls() {
    bindDrawingSelection();
    updateDrawingControls();

    const deleteBtn = document.getElementById('deleteSelectedDrawingBtn');
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            deleteSelectedDrawing();
        };
    }
}

export function setTextAnnotationsVisibility(isVisible) {
    const annotationLayer = getLayerRecord(ANNOTATION_LAYER_ID);
    if (!annotationLayer) {
        return;
    }

    annotationLayer.source.getFeatures().forEach((feature) => {
        if (feature.get('isAnnotation')) {
            feature.set('annotationVisible', isVisible);
        }
    });

    annotationLayer.layer.changed();
    updateAnnotationControls();
}

export function bindAnnotationVisibilityToggle() {
    const toggle = document.getElementById('annotationsToggle');
    if (!toggle) {
        return;
    }

    toggle.addEventListener('change', (event) => {
        setTextAnnotationsVisibility(event.target.checked);
    });
}

export function initializeMeasurementControls() {
    const panel = document.getElementById('measureResultsPanel');
    if (!panel) {
        return;
    }

    updateMeasurementResultPanel(Number.NaN);
    updateMeasurementControls();
    createMeasureHoverTooltip();
    bindMeasurementHover();
    bindMeasurementSelection();
    bindInteractiveEscapeKey();

    const deleteBtn = document.getElementById('deleteSelectedMeasurementBtn');
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            deleteSelectedMeasurement();
        };
    }
}


