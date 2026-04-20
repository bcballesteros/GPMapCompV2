import { DEFAULT_LAYER_COLOR, DEFAULT_VECTOR_OPACITY, ANNOTATION_LAYER_ID } from '../config/constants.js';
import { DEFAULT_VIEW_PADDING } from '../config/defaults.js';
import ol from '../lib/ol.js';
import { createBasemapSource } from '../config/basemaps.js';
import { getLayerRecord, getMap, getState, removeLayerRecord, setActiveBasemap, setCurrentLayerName, setLayerRecord } from '../state/store.js';
import { createAnnotationStyle, createManagedFeatureStyles, pickDefaultLabelField } from './style-factory.js';

export function findLayerNameByLayer(targetLayer) {
    const uploadedLayers = getState().uploadedLayers;
    return Object.keys(uploadedLayers).find((name) => uploadedLayers[name].layer === targetLayer) || null;
}

export function addVectorLayer(layerName, layerColor, geojson, features) {
    const source = new ol.source.Vector({ features });
    const layerRecord = {
        source,
        layer: null,
        geojson,
        features,
        color: layerColor,
        opacity: DEFAULT_VECTOR_OPACITY,
        geometryType: geojson.features[0]?.geometry?.type || 'Unknown',
        isWMS: false,
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

export function addWmsLayer(layerName, source, layer) {
    getMap().addLayer(layer);
    setLayerRecord(layerName, {
        source,
        layer,
        geojson: null,
        features: [],
        color: DEFAULT_LAYER_COLOR,
        opacity: DEFAULT_VECTOR_OPACITY,
        geometryType: 'WMS',
        isWMS: true
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
