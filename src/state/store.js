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

export function getState() {
    return state;
}

export function setMap(mapInstance) {
    state.map = mapInstance;
}

export function setActiveBasemap(basemapName) {
    state.activeBasemap = basemapName;
}

export function setCurrentLayerName(layerName) {
    state.currentLayerName = layerName;
}

export function setCurrentLayerData(layerData) {
    state.currentLayerData = layerData;
    window.currentLayerData = layerData;
}

export function setSelectedTool(toolName) {
    state.selectedTool = toolName;
}

export function setSelectedFeature(feature) {
    state.selectedFeature = feature;
}

export function setAnnotationMode(mode) {
    state.annotationMode = mode;
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
}

export function removeLayerRecord(layerName) {
    delete state.uploadedLayers[layerName];
}
