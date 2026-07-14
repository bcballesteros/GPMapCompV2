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
        svgMarkerDataUrl: null,
        svgMarkerGallery: [],
        activeSvgMarkerIndex: 0,
        markerPresetType: null,
        markerStrokeColor: layerColor,
        markerStrokeWidth: 1,
        markerStrokeEnabled: false,
        lineStrokeWidth: DEFAULT_LINE_STROKE_WIDTH,
        polygonFillColor: layerColor,
        polygonStrokeColor: layerColor,
        polygonStrokeWidth: DEFAULT_LINE_STROKE_WIDTH,
        geometryType: getLayerGeometryType(geojson),
        isPointLayer: isPointLayer(geojson),
        isLineLayer: isLineLayer(geojson),
        isPolygonLayer: isPolygonLayer(geojson),
        isWMS: false,
        layerExtent: null,
        layerExtentProjection: '',
        zoomUnavailableReason: '',
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
        layerExtent: Array.isArray(metadata.layerExtent) ? metadata.layerExtent : null,
        layerExtentProjection: metadata.layerExtentProjection || '',
        zoomUnavailableReason: metadata.zoomUnavailableReason || '',
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

function normalizeExtent(extent) {
    if (!Array.isArray(extent) || extent.length !== 4) {
        return null;
    }

    const normalized = extent.map((value) => Number(value));
    if (!normalized.every(Number.isFinite)) {
        return null;
    }

    const [minX, minY, maxX, maxY] = normalized;
    if (minX >= maxX || minY >= maxY) {
        return null;
    }

    return normalized;
}

function normalizeProjectionCode(code) {
    const value = String(code || '').trim().toUpperCase();
    if (!value) {
        return '';
    }

    if (value.includes('CRS:84') || value.includes('OGC:1.3:CRS84')) {
        return 'EPSG:4326';
    }

    if (value.includes('EPSG:4326')) {
        return 'EPSG:4326';
    }

    if (value.includes('EPSG:3857') || value.includes('EPSG:900913')) {
        return 'EPSG:3857';
    }

    return value;
}

function getStoredRecordExtent(record) {
    const storedExtent = normalizeExtent(record?.layerExtent);
    if (!storedExtent) {
        return null;
    }

    const mapProjection = getMap()?.getView?.()?.getProjection?.()?.getCode?.() || 'EPSG:3857';
    const sourceProjection = normalizeProjectionCode(record?.layerExtentProjection) || mapProjection;
    if (sourceProjection === mapProjection) {
        return storedExtent;
    }

    try {
        return normalizeExtent(ol.proj.transformExtent(storedExtent, sourceProjection, mapProjection));
    } catch {
        return null;
    }
}

export function getZoomExtent(target) {
    if (target?.source) {
        return getZoomExtent(target.source) || getStoredRecordExtent(target);
    }

    if (typeof target?.getExtent === 'function') {
        const sourceExtent = normalizeExtent(target.getExtent());
        if (sourceExtent && !ol.extent.isEmpty(sourceExtent)) {
            return sourceExtent;
        }
    }

    return null;
}

export function canZoomToLayer(target) {
    return Boolean(getZoomExtent(target));
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
    const extent = getZoomExtent(source);
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
