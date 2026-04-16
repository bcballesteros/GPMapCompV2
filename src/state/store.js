
const state = {
    map: null,
    activeBasemap: 'namria',
    currentLayerName: null,
    currentLayerData: null,
    selectedTool: null,
    selectedFeature: null,
    annotationMode: null,
    uploadedLayers: {}
};

function emitStateChange(key, value) {
    window.dispatchEvent(new CustomEvent('gpmap:statechange', {
        detail: { key, value }
    }));
}

export function getState() {
    return state;
}

export function setMap(mapInstance) {
    state.map = mapInstance;
    emitStateChange('map', mapInstance);
}

export function setActiveBasemap(basemapName) {
    state.activeBasemap = basemapName;
    emitStateChange('activeBasemap', basemapName);
}

export function setCurrentLayerName(layerName) {
    state.currentLayerName = layerName;
    emitStateChange('currentLayerName', layerName);
}

export function setCurrentLayerData(layerData) {
    state.currentLayerData = layerData;
    window.currentLayerData = layerData;
    emitStateChange('currentLayerData', layerData);
}

export function setSelectedTool(toolName) {
    state.selectedTool = toolName;
    emitStateChange('selectedTool', toolName);
}

export function setSelectedFeature(feature) {
    state.selectedFeature = feature;
    emitStateChange('selectedFeature', feature);
}

export function setAnnotationMode(mode) {
    state.annotationMode = mode;
    emitStateChange('annotationMode', mode);
}

export function getMap() {
    return state.map;
}

export function getCurrentLayerData() {
    return state.currentLayerData;
}

export function getCurrentLayerName() {
    return state.currentLayerName;
}

export function getUploadedLayers() {
    return state.uploadedLayers;
}

export function getLayerRecord(layerName) {
    return state.uploadedLayers[layerName] || null;
}

export function setLayerRecord(layerName, record) {
    state.uploadedLayers[layerName] = record;
    emitStateChange('uploadedLayers', { ...state.uploadedLayers });
}

export function removeLayerRecord(layerName) {
    delete state.uploadedLayers[layerName];
    emitStateChange('uploadedLayers', { ...state.uploadedLayers });
}
