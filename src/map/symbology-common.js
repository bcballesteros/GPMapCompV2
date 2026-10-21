// Shared category preparation and runtime lookups for all vector geometries.
const runtime = new WeakMap();

export function categoryKey(value) {
    if (value === null || value === undefined) return 'missing';
    if (typeof value === 'string') return `string:${JSON.stringify(value)}`;
    if (typeof value === 'boolean') return `boolean:${value}`;
    if (typeof value === 'number' && Number.isFinite(value)) return `number:${value}`;
    return 'unmapped';
}

export function properties(feature) {
    return feature?.getProperties?.() || feature?.properties || {};
}

export function invalidateSymbology(record) { runtime.delete(record); }

export function getSymbologyRuntime(record) {
    let state = runtime.get(record);
    if (!state) {
        const config = record.symbology;
        state = { categories: new Map(config.categories.map(c => [c.id, c])), styles: new Map() };
        runtime.set(record, state);
    }
    return state;
}

export function resolveCategory(record, feature) {
    const config = record.symbology;
    if (config.mode === 'single') return config.single;
    if (!config.attribute) return config.provenance.type === 'sld' ? config.categories[0] : config.unmapped;
    const key = categoryKey((feature?.get ? feature.get(config.attribute) : properties(feature)[config.attribute]));
    return key === 'missing' ? config.missing : getSymbologyRuntime(record).categories.get(key) || config.unmapped;
}

// On-demand inspection of the application's current features, using the same
// resolver as rendering. No feature references or extra scans enter import or
// the per-feature style path. Missing fields, nulls and exact strings stay clear.
export function inspectImportedMatches(record) {
    const config = record?.symbology;
    if (config?.mode !== 'categorized' || config.provenance.type !== 'sld') return null;
    const features = record.source?.getFeatures?.() || record.features || [];
    const counts = new Map(config.categories.map(category => [category.id, 0]));
    const unmatched = new Map();
    let matchedFeatures = 0;
    for (const feature of features) {
        const category = resolveCategory(record, feature);
        if (counts.has(category.id)) {
            matchedFeatures++;
            counts.set(category.id, counts.get(category.id) + 1);
        } else {
            const props = properties(feature), present = Object.hasOwn(props, config.attribute);
            const value = present ? props[config.attribute] : undefined;
            const type = value === null ? 'null' : typeof value;
            const key = JSON.stringify([present, type, categoryKey(value)]);
            const entry = unmatched.get(key) || { value: value ?? null, type, present, count: 0 };
            entry.count++;
            unmatched.set(key, entry);
        }
    }
    return { attribute: config.attribute, totalFeatures: features.length, matchedFeatures,
        unmatchedFeatures: features.length - matchedFeatures, unmatchedValues: [...unmatched.values()],
        unusedRules: config.categories.filter(category => !counts.get(category.id))
            .map(category => ({ value: category.value, label: category.label })) };
}

export function prepareImportedCategories(record, parsed) {
    const features = record.source?.getFeatures?.() || record.features || [];
    const counts = new Map();
    const types = new Set();
    let present = false;
    for (const feature of features) {
        const props = properties(feature);
        if (parsed.attribute && Object.hasOwn(props, parsed.attribute)) present = true;
        const v = parsed.attribute && Object.hasOwn(props, parsed.attribute) ? props[parsed.attribute] : null;
        if (v !== null && v !== undefined) {
            if (categoryKey(v) === 'unmapped') throw new Error(`Incompatible attribute "${parsed.attribute}": only string, number or boolean values are supported.`);
            types.add(typeof v);
            const key = categoryKey(v);
            counts.set(key, (counts.get(key) || 0) + 1);
        }
    }
    if (parsed.attribute && !present) throw new Error(`SLD attribute "${parsed.attribute}" is missing from this dataset.`);
    if (parsed.attribute && types.size !== 1) throw new Error(`Incompatible attribute "${parsed.attribute}": expected one nonempty scalar value type; mixed types are ambiguous.`);
    const type = [...types][0];
    const seen = new Set();
    const categories = parsed.rules.map((rule, index) => {
        let v = rule.literal;
        if (parsed.attribute && type === 'number') {
            if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim()) || !Number.isFinite(Number(v))) throw new Error(`Rule "${rule.label}" is incompatible with numeric attribute "${parsed.attribute}".`);
            v = Number(v);
        } else if (parsed.attribute && type === 'boolean') {
            if (!['true', 'false', '1', '0'].includes(v.trim())) throw new Error(`Rule "${rule.label}" is incompatible with boolean attribute "${parsed.attribute}".`);
            v = ['true', '1'].includes(v.trim());
        }
        const id = parsed.attribute ? categoryKey(v) : 'sld:all';
        if (seen.has(id)) throw new Error('Duplicate equality values require overlapping rules, which are not supported.');
        seen.add(id);
        return { id, value: v, label: rule.label, ruleName: rule.name, order: index,
            count: parsed.attribute ? counts.get(id) || 0 : features.length, symbolizers: structuredClone(rule.symbolizers) };
    });
    const matched = categories.reduce((sum, category) => sum + category.count, 0);
    if (!matched) throw new Error('No SLD rule values match this dataset. Existing styling was preserved.');
    const unmatchedFeatures = features.length - matched;
    const unmatchedRules = categories.filter(category => !category.count).length;
    return { categories, report: { ruleCount: categories.length, matchedFeatures: matched, unmatchedFeatures, unmatchedRules } };
}
