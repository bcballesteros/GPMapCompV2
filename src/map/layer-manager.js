import { DEFAULT_LAYER_COLOR, DEFAULT_LINE_STROKE_WIDTH, DEFAULT_POINT_SIZE, DEFAULT_VECTOR_OPACITY, ANNOTATION_LAYER_ID } from '../config/constants.js';
import { DEFAULT_VIEW_PADDING } from '../config/defaults.js';
import ol from '../lib/ol.js';
import { createBasemapSource } from '../config/basemaps.js';
import { getLayerRecord, getMap, getState, removeLayerRecord, setActiveBasemap, setCurrentLayerName, setLayerRecord } from '../state/store.js';
import { createAnnotationStyle, createManagedFeatureStyles, pickDefaultLabelField } from './style-factory.js';

export function findLayerNameByLayer(targetLayer) {
    const uploadedLayers = getState().uploadedLayers;
    return Object.keys(uploadedLayers).find((name) => uploadedLayers[name].layer === targetLayer) || null;
}

function isPointGeometryType(type) {
    return type === 'Point' || type === 'MultiPoint';
}

function isLineGeometryType(type) {
    return type === 'LineString' || type === 'MultiLineString';
}

function isPolygonGeometryType(type) {
    return type === 'Polygon' || type === 'MultiPolygon';
}

function getLayerGeometryType(geojson) {
    const geometryTypes = (geojson?.features || [])
        .map((feature) => feature?.geometry?.type)
        .filter(Boolean);

    if (geometryTypes.length === 0) {
        return 'Unknown';
    }

    const uniqueTypes = [...new Set(geometryTypes)];
    return uniqueTypes.length === 1 ? uniqueTypes[0] : 'Mixed';
}

function isPointLayer(geojson) {
    const geometryTypes = (geojson?.features || [])
        .map((feature) => feature?.geometry?.type)
        .filter(Boolean);

    return geometryTypes.length > 0 && geometryTypes.every(isPointGeometryType);
}

function isLineLayer(geojson) {
    const geometryTypes = (geojson?.features || [])
        .map((feature) => feature?.geometry?.type)
        .filter(Boolean);

    return geometryTypes.length > 0 && geometryTypes.every(isLineGeometryType);
}

function isPolygonLayer(geojson) {
    const geometryTypes = (geojson?.features || [])
        .map((feature) => feature?.geometry?.type)
        .filter(Boolean);

    return geometryTypes.length > 0 && geometryTypes.every(isPolygonGeometryType);
}

export function addVectorLayer(layerName, layerColor, geojson, features, metadata = {}) {
    const source = new ol.source.Vector({ features });
    const layerRecord = {
        source,
        layer: null,
        geojson,
        features,
        color: layerColor,
        opacity: DEFAULT_VECTOR_OPACITY,
        pointSize: DEFAULT_POINT_SIZE,
        lineStrokeWidth: DEFAULT_LINE_STROKE_WIDTH,
        polygonFillColor: layerColor,
        polygonStrokeColor: layerColor,
        polygonStrokeWidth: DEFAULT_LINE_STROKE_WIDTH,
        geometryType: getLayerGeometryType(geojson),
        isPointLayer: isPointLayer(geojson),
        isLineLayer: isLineLayer(geojson),
        isPolygonLayer: isPolygonLayer(geojson),
        isWMS: false,
        sourceCrs: metadata.sourceCrs || 'Unknown CRS',
        sourceCrsDetected: Boolean(metadata.sourceCrsDetected),
        labelsVisible: false,
        labelField: pickDefaultLabelField(features)
    };
    const layer = new ol.layer.Vector({
        source,
        style: (feature) => createManagedFeatureStyles(layerRecord, feature)
    });
    layerRecord.layer = layer;

    getMap().addLayer(layer);
    setLayerRecord(layerName, layerRecord);
    setCurrentLayerName(layerName);

    return getLayerRecord(layerName);
}

export function addWmsLayer(layerName, source, layer, metadata = {}) {
    getMap().addLayer(layer);
    setLayerRecord(layerName, {
        source,
        layer,
        geojson: null,
        features: [],
        color: DEFAULT_LAYER_COLOR,
        opacity: DEFAULT_VECTOR_OPACITY,
        geometryType: 'WMS',
        isWMS: true,
        isGP: Boolean(metadata.isGP),
        sourceCrs: metadata.sourceCrs || 'Unknown CRS',
        sourceCrsDetected: Boolean(metadata.sourceCrsDetected),
        wmsUrl: metadata.wmsUrl || '',
        wmsLayerName: metadata.wmsLayerName || '',
        gpUrl: metadata.gpUrl || '',
        gpLayerName: metadata.gpLayerName || '',
        gpLayerType: metadata.gpLayerType || '',
        gpTileUrl: metadata.gpTileUrl || '',
        displayName: metadata.displayName || layerName
    });
    setCurrentLayerName(layerName);

    return getLayerRecord(layerName);
}

export function removeManagedLayer(layerName) {
    const record = getLayerRecord(layerName);
    if (!record) {
        return;
    }

    getMap().removeLayer(record.layer);
    removeLayerRecord(layerName);
}

export function fitLayerToView(source) {
    const extent = source.getExtent();
    if (extent && !ol.extent.isEmpty(extent)) {
        getMap().getView().fit(extent, {
            padding: DEFAULT_VIEW_PADDING,
            duration: 800
        });
    }
}

export function updateManagedLayerStyle(layerName, styleFactory) {
    const record = getLayerRecord(layerName);
    if (!record) {
        return;
    }

    if (record.isWMS) {
        record.layer.setOpacity(record.opacity);
        return;
    }

    if (!styleFactory && typeof record.color !== 'string') {
        return;
    }

    record.layer.setStyle(styleFactory || ((feature) => createManagedFeatureStyles(record, feature)));
    record.layer.changed();
}

export function ensureAnnotationLayer() {
    const existing = getLayerRecord(ANNOTATION_LAYER_ID);
    if (existing) {
        return existing;
    }

    const source = new ol.source.Vector();
    const layer = new ol.layer.Vector({
        source,
        style: createAnnotationStyle
    });

    getMap().addLayer(layer);
    setLayerRecord(ANNOTATION_LAYER_ID, { source, layer });

    return getLayerRecord(ANNOTATION_LAYER_ID);
}

export function changeBasemapLayer(basemapName) {
    const map = getMap();
    const basemapLayer = map.getLayers().item(0);

    if (basemapLayer) {
        map.removeLayer(basemapLayer);
    }

    map.getLayers().insertAt(0, new ol.layer.Tile({
        source: createBasemapSource(basemapName)
    }));

    setActiveBasemap(basemapName);
}
