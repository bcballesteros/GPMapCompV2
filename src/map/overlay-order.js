import { topToBottomLayers } from '../utils/layer-list-layout.js';

// OpenLayers z-index is the only persisted order. No parallel rank registry.
const controlledMaps = new WeakSet();
const updatingMaps = new WeakSet();
export const isOverlayOrderUpdating = map => updatingMaps.has(map);

export function eligibleOverlays(records) {
    return Object.values(records).filter(record => !record.isAnnotation &&
        (record.isWMS || record.isGP || record.geojson || record.isPointLayer || record.isLineLayer || record.isPolygonLayer))
        .map(record => record.layer).filter(Boolean);
}

export function applyOverlayOrder(map, eligible, requested) {
    const allowed = new Set(eligible);
    const current = topToBottomLayers(map).filter(layer => allowed.has(layer));
    if (requested.length !== current.length || new Set(requested).size !== current.length ||
        requested.some(layer => !current.includes(layer))) return false;
    if (requested.every((layer, index) => layer === current[index])) return false;
    normalize(map, requested);
    controlledMaps.add(map);
    return true;
}

function normalize(map, topFirst) {
    updatingMaps.add(map);
    try {
        // Fractional priorities in (-1, 0) leave existing operational layers at
        // zero (or higher) untouched. Basemaps occupy -1. Never move collections.
        map.getLayers().forEach(layer => {
            if (layer.get('basemapId')) layer.setZIndex(-1);
        });
        topFirst.forEach((layer, index) => layer.setZIndex(-(index + 1) / (topFirst.length + 1)));
    } finally {
        updatingMaps.delete(map);
    }
    map.dispatchEvent('change:overlayorder');
}

export function insertOrderedOverlay(map, eligible, added) {
    if (!controlledMaps.has(map)) return;
    const allowed = new Set(eligible);
    normalize(map, [added, ...topToBottomLayers(map).filter(layer => layer !== added && allowed.has(layer))]);
}

export function prepareOrderedBasemap(map, layer) {
    if (controlledMaps.has(map)) layer.setZIndex(-1);
    return layer;
}
