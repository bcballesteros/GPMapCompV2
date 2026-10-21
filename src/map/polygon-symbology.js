import { categoryKey, properties, prepareImportedCategories, invalidateSymbology as invalidatePolygonSymbology, getSymbologyRuntime, resolveCategory, inspectImportedMatches as inspectImportedPolygonMatches } from './symbology-common.js';
export { categoryKey, invalidatePolygonSymbology, inspectImportedPolygonMatches };
import { DEFAULT_LINE_STROKE_WIDTH } from '../config/constants.js';

// Serializable configuration only. Lookups and OpenLayers styles live outside it.
export const CATEGORY_WARNING_LIMIT = 100;
const excludedFields = /^(geometry|shape|objectid|fid|id|globalid|shape_length|shape_area)$/i;

export function getPolygonRuntime(record) { ensurePolygonSymbology(record); return getSymbologyRuntime(record); }
export function resolvePolygonCategory(record, feature) { ensurePolygonSymbology(record); return resolveCategory(record, feature); }

// One pass over attributes; objects, geometry, IDs and all-empty fields are not offered.
export function discoverClassificationFields(features) {
    const fields = new Map();
    for (const feature of features) {
        for (const [field, value] of Object.entries(properties(feature))) {
            if (excludedFields.test(field) || field === feature?.getGeometryName?.()) continue;
            const key = categoryKey(value);
            if (key === 'missing') continue;
            const entry = fields.get(field) || { field, keys: new Set(), unsupported: false };
            if (key === 'unmapped') entry.unsupported = true;
            else entry.keys.add(key);
            fields.set(field, entry);
        }
    }
    return [...fields.values()].filter(entry => !entry.unsupported && entry.keys.size)
        .map(entry => ({ field: entry.field, distinctCount: entry.keys.size,
            highCardinality: entry.keys.size > CATEGORY_WARNING_LIMIT }))
        .sort((a, b) => a.field < b.field ? -1 : a.field > b.field ? 1 : 0);
}

export function ensurePolygonSymbology(record) {
    if (record.symbology) {
        // Older managed configs predate the stroke switch. Keep their former
        // appearance and fill in the current serializable symbology config.
        record.symbology.stroke ||= { enabled: true,
            color: record.polygonStrokeColor || record.color,
            width: record.polygonStrokeWidth ?? DEFAULT_LINE_STROKE_WIDTH };
        if (record.symbology.stroke.enabled === undefined) record.symbology.stroke.enabled = true;
        return record.symbology;
    }
    const config = record.symbology = {
        version: 1, mode: 'single', attribute: null, categories: [],
        single: { symbolizers: [{ type: 'polygon', fill: { color: record.polygonFillColor || record.color } }] },
        stroke: { enabled: true, color: record.polygonStrokeColor || record.color, width: record.polygonStrokeWidth ?? DEFAULT_LINE_STROKE_WIDTH },
        missing: { id: 'missing', label: 'Missing value', count: 0, symbolizers: [{ type: 'polygon', fill: { color: '#B8BEC7' } }] },
        unmapped: { id: 'unmapped', label: 'Other / unmapped', symbolizers: [{ type: 'polygon', fill: { color: '#777777' } }] },
        provenance: { type: 'generated' }
    };
    // Legacy controls remain aliases, rather than a second source of truth.
    for (const [field, target, key] of [
        ['polygonFillColor', config.single.symbolizers[0].fill, 'color'],
        ['polygonStrokeColor', config.stroke, 'color'],
        ['polygonStrokeWidth', config.stroke, 'width']
    ]) Object.defineProperty(record, field, { enumerable: true, configurable: true,
        get: () => target[key], set: value => { target[key] = value; } });
    return config;
}

function defaultColor(index) {
    // Golden-angle hues, converted to hex for the existing picker.
    const hue = (index * 137.508 + 24) % 360;
    const s = 0.63, l = index % 2 ? 0.57 : 0.44;
    const a = s * Math.min(l, 1 - l);
    const channel = n => {
        const k = (n + hue / 30) % 12;
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
            .toString(16).padStart(2, '0');
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function classifyPolygonLayer(record, attribute, { confirmed = false } = {}) {
    const config = ensurePolygonSymbology(record);
    const values = new Map();
    let missingCount = 0;
    for (const feature of record.source?.getFeatures?.() || record.features || []) {
        const value = properties(feature)[attribute];
        const key = categoryKey(value);
        if (key === 'missing') missingCount++;
        else if (key !== 'unmapped') values.set(key, { value, count: (values.get(key)?.count || 0) + 1 });
    }
    if (values.size > CATEGORY_WARNING_LIMIT && !confirmed) {
        return { requiresConfirmation: true, count: values.size };
    }
    const generated = config.provenance.type === 'sld' ? config.savedCategorized?.generated : config;
    const previous = generated?.attribute === attribute ? new Map(generated.categories.map(c => [c.id, c])) : new Map();
    saveCategorized(config);
    if (config.provenance.type === 'sld') {
        config.missing = structuredClone(config.savedCategorized.generated.missing);
        config.unmapped = structuredClone(config.savedCategorized.generated.unmapped);
    }
    config.categories = [...values.keys()].sort().map((id, index) => {
        const { value, count } = values.get(id);
        return { id, value, label: typeof value === 'string' ? (value || '(empty string)') : `${value} (${typeof value})`, count,
            symbolizers: previous.get(id)?.symbolizers || [{ type: 'polygon', fill: { color: defaultColor(index) } }] };
    });
    config.attribute = attribute;
    config.missing.count = missingCount;
    config.mode = 'categorized';
    config.provenance = { type: 'generated' };
    invalidatePolygonSymbology(record);
    return { requiresConfirmation: false, count: values.size };
}

export function resolvePolygonSymbols(record, category) {
    const config = ensurePolygonSymbology(record);
    const imported = config.mode === 'categorized' && config.provenance.type === 'sld';
    return category.symbolizers.map(symbolizer => {
        const stroke = { ...config.stroke, ...symbolizer.stroke };
        return { type: 'polygon', fillColor: symbolizer.fill?.color, fillEnabled: symbolizer.fill?.enabled !== false,
            fillOpacity: symbolizer.fill?.opacity ?? 1, ...(symbolizer.fill?.pattern ? { pattern: symbolizer.fill.pattern } : {}),
            stroke: { ...stroke, opacity: stroke.opacity ?? 1,
                enabled: (imported ? config.importedStrokeEnabled !== false && stroke.width > 0 : config.stroke.enabled !== false) && stroke.enabled !== false }, opacity: record.opacity };
    });
}

// Compatibility for callers inspecting a simple, one-symbol polygon.
export function resolvePolygonSymbol(record, category) { return resolvePolygonSymbols(record, category)[0]; }

export function polygonBaseFill(category) {
    return category.symbolizers.find(symbol => symbol.fill && symbol.fill.enabled !== false && !symbol.fill.pattern)?.fill;
}

export function getPolygonLegendDescriptors(record, layerIdentity) {
    if (!record?.isPolygonLayer || record.isWMS) return [];
    const config = ensurePolygonSymbology(record);
    const entries = config.mode === 'single' ? [{ ...config.single, id: 'single', label: 'Single Color' }]
        : config.provenance.type === 'sld' ? config.categories
        : [...config.categories, ...(config.attribute ? [config.missing] : []), config.unmapped];
    return entries.map((category, order) => {
        const symbols = resolvePolygonSymbols(record, category);
        return { layerIdentity, id: category.id, label: category.label,
            order, count: category.count, symbol: symbols[0], symbols, baseFillColor: polygonBaseFill(category)?.color };
    });
}

export function setPolygonCategoryColor(record, id, color) {
    if (!/^#[\da-f]{6}$/i.test(color)) return false;
    const config = ensurePolygonSymbology(record);
    const category = [config.missing, config.unmapped, ...config.categories].find(c => c.id === id);
    const fill = category && polygonBaseFill(category);
    if (!fill) return false;
    fill.color = color;
    invalidatePolygonSymbology(record);
    return true;
}

const categoryFields = ['attribute', 'categories', 'missing', 'unmapped', 'provenance', 'importedStrokeEnabled'];
function snapshot(config) {
    return structuredClone(Object.fromEntries(categoryFields.filter(key => config[key] !== undefined).map(key => [key, config[key]])));
}
function saveCategorized(config) {
    config.savedCategorized ||= {};
    config.savedCategorized[config.provenance.type === 'sld' ? 'sld' : 'generated'] = snapshot(config);
}

// UI modes select stored configurations; authoritative rendering still uses the
// same single/categorized model. Snapshots contain only plain serializable data.
export function switchPolygonMode(record, mode) {
    const config = ensurePolygonSymbology(record);
    if (!['single', 'categorized', 'imported'].includes(mode)) return false;
    if (mode === 'imported' && config.provenance.type !== 'sld' && !config.savedCategorized?.sld) return false;
    if (mode !== 'single') {
        saveCategorized(config);
        const selected = config.savedCategorized[mode === 'imported' ? 'sld' : 'generated'];
        if (selected) Object.assign(config, structuredClone(selected));
    }
    config.mode = mode === 'single' ? 'single' : 'categorized';
    invalidatePolygonSymbology(record);
    return true;
}

// Validate and prepare everything before touching the existing configuration.
// Equality literals are converted only for homogeneous numeric/boolean fields;
// strings keep exact case and whitespace. Mixed types are ambiguous, so reject.
export function applyImportedPolygonStyle(record, parsed, fileName = '') {
    if (!record?.isPolygonLayer || record.isWMS) throw new Error('SLD import supports uploaded polygon layers only.');
    if (parsed.geometryType && parsed.geometryType !== 'polygon') throw new Error('SLD geometry is incompatible with this polygon layer.');
    const { categories, report } = prepareImportedCategories(record, parsed);
    const { unmatchedFeatures, unmatchedRules } = report;
    const transparent = id => ({ id, label: id === 'missing' ? 'Missing value' : 'Other / unmapped',
        symbolizers: [{ type: 'polygon', fill: { color: '#808080', enabled: false }, stroke: { enabled: false } }] });
    const config = ensurePolygonSymbology(record);
    saveCategorized(config);
    Object.assign(config, { mode: 'categorized', attribute: parsed.attribute, categories,
        missing: transparent('missing'), unmapped: transparent('unmapped'), importedStrokeEnabled: true,
        provenance: { type: 'sld', version: parsed.sldVersion, fileName, title: parsed.title, unmatchedFeatures, unmatchedRules } });
    invalidatePolygonSymbology(record);
    return report;
}
