// The renderer sorts flattened layer states by z-index, preserving collection
// order for ties. Reverse that drawing order to show the topmost layer first.
export function topToBottomLayers(map) {
    return (map?.getLayerGroup?.().getLayerStatesArray() || [])
        .map((state, index) => ({ ...state, index }))
        .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0) || b.index - a.index)
        .map(state => state.layer);
}

export function layerSourceType(record, options = {}) {
    if (record?.isAnnotation) return 'Annotation';
    if (record?.isGP || options.isGP) return 'Geoportal';
    if (record?.isWMS || options.isWMS) return 'WMS';
    // geojson also identifies empty and mixed-geometry vector imports.
    if (record?.geojson || record?.isPointLayer || record?.isLineLayer || record?.isPolygonLayer) return 'Vector';
    return 'Other';
}

export function layerSubtitle(sourceType, featureCount) {
    if (sourceType === 'WMS' || sourceType === 'Geoportal') return `${sourceType} · Map Service`;
    const count = Number.isFinite(featureCount) ? featureCount.toLocaleString('en-US') : null;
    return count === null ? sourceType : `${sourceType} · ${count} Feature${featureCount === 1 ? '' : 's'}`;
}
