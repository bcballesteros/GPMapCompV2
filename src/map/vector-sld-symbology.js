import { getSymbologyRuntime, invalidateSymbology, prepareImportedCategories, resolveCategory } from './symbology-common.js';

export function isImportedVectorStyle(record) {
    return !record?.isWMS && (record?.isPointLayer || record?.isLineLayer)
        && record.symbology?.mode === 'categorized' && record.symbology.provenance?.type === 'sld';
}

export function applyImportedVectorStyle(record, parsed, fileName = '') {
    const geometryType = record?.isPointLayer ? 'point' : record?.isLineLayer ? 'line' : null;
    if (!geometryType || record.isWMS) throw new Error('SLD import requires an uploaded point or line layer.');
    if (parsed.geometryType !== geometryType || parsed.rules.some(rule => rule.symbolizers.some(symbol => symbol.type !== geometryType))) {
        throw new Error(`SLD geometry is incompatible with this ${geometryType} layer.`);
    }
    const { categories, report } = prepareImportedCategories(record, parsed);
    // Manual marker/SVG/line settings stay on the record. Switching modes never
    // overwrites them; replacement imports replace only this serializable config.
    record.symbology = { version: 1, geometryType, mode: 'categorized', attribute: parsed.attribute, categories,
        missing: { id: 'missing', symbolizers: [] }, unmapped: { id: 'unmapped', symbolizers: [] },
        provenance: { type: 'sld', version: parsed.sldVersion, fileName, title: parsed.title, ...report } };
    invalidateSymbology(record);
    return report;
}

export function switchVectorStyleMode(record, mode) {
    if (!record?.symbology || !['manual', 'imported'].includes(mode) || record.symbology.provenance?.type !== 'sld') return false;
    record.symbology.mode = mode === 'manual' ? 'manual' : 'categorized';
    invalidateSymbology(record);
    return true;
}

export function resolveImportedVectorSymbols(record, category) {
    return category.symbolizers.map(symbol => ({ ...symbol,
        opacity: (record.opacity ?? 1) * (symbol.opacity ?? 1),
        ...(symbol.fill ? { fill: { ...symbol.fill } } : {}),
        stroke: { ...symbol.stroke, enabled: symbol.stroke.enabled !== false && symbol.stroke.width > 0,
            lineCap: symbol.stroke.lineCap ?? 'butt', lineJoin: symbol.stroke.lineJoin ?? 'miter' } }));
}

export function getImportedVectorStyles(record, feature, compile, highlighted = false) {
    const category = resolveCategory(record, feature);
    const cache = getSymbologyRuntime(record).styles;
    const key = JSON.stringify([category.id, record.opacity, highlighted]);
    if (!cache.has(key)) cache.set(key, resolveImportedVectorSymbols(record, category).map(symbol => compile(symbol, highlighted)));
    return cache.get(key);
}

export function getImportedVectorLegendDescriptors(record, layerIdentity) {
    if (!isImportedVectorStyle(record)) return [];
    return record.symbology.categories.map((category, order) => {
        const symbols = resolveImportedVectorSymbols(record, category);
        return { layerIdentity, geometryType: record.geometryType, id: category.id, label: category.label, count: category.count,
            order, symbolType: record.symbology.geometryType, symbol: symbols[0], symbols };
    });
}
