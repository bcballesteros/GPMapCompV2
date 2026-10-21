import test from 'node:test';
import assert from 'node:assert/strict';
import Feature from 'ol/Feature.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import { applyImportedPolygonStyle, categoryKey, classifyPolygonLayer, ensurePolygonSymbology,
    getPolygonLegendDescriptors, inspectImportedPolygonMatches, invalidatePolygonSymbology, resolvePolygonCategory, setPolygonCategoryColor, switchPolygonMode } from '../src/map/polygon-symbology.js';
import { createManagedFeatureStyles } from '../src/map/style-factory.js';
import { parseSld, SLD_LIMITS, validateSldFile } from '../src/map/sld-importer.js';

const record = (values = ['Forest', 'Water', null, 'Other']) => ({ isPolygonLayer: true, color: '#2563eb',
    polygonFillColor: '#2563eb', polygonStrokeColor: '#123456', polygonStrokeWidth: 2, opacity: 0.6,
    features: values.map((kind, i) => new Feature({ kind, second: i % 2 === 0, geometry: i % 2 ? new MultiPolygon([]) : new Polygon([]) })) });
const parsed = (values = ['Water', 'Forest']) => ({ sldVersion: '1.0.0', title: 'Example', attribute: 'kind',
    rules: values.map((literal, i) => ({ literal, name: `rule-${i}`, label: `Description ${i}`,
        symbolizers: [{ type: 'polygon', fill: { enabled: true, color: i ? '#00AA00' : '#123456', opacity: 0.5 },
            stroke: { enabled: !i, color: '#ABCDEF', width: 2.5, opacity: 0.25 } }] })) });
const style = (r, index = 0) => createManagedFeatureStyles(r, r.features[index])[0];

test('import shares ordered typed categories, labels, paint, opacity, no-match behavior and cache with legends', () => {
    const r = record();
    r.labelsVisible = true; r.labelField = 'kind';
    const report = applyImportedPolygonStyle(r, parsed(), 'example.sld');
    assert.deepEqual(report, { ruleCount: 2, matchedFeatures: 2, unmatchedFeatures: 2, unmatchedRules: 0 });
    assert.equal(r.symbology.mode, 'categorized');
    assert.deepEqual(r.symbology.categories.map(c => c.value), ['Water', 'Forest']);
    assert.equal(r.symbology.provenance.fileName, 'example.sld');
    assert.equal(style(r, 1).getFill().getColor(), 'rgba(18, 52, 86, 0.3)');
    assert.equal(style(r, 1).getStroke().getColor(), 'rgba(171, 205, 239, 0.15)');
    assert.equal(style(r, 1).getStroke().getWidth(), 2.5);
    assert.equal(style(r).getStroke(), null);
    for (const index of [2, 3]) {
        assert.equal(style(r, index).getFill(), null);
        assert.equal(style(r, index).getStroke(), null);
    }
    assert.equal(style(r), style(r));
    assert.equal(createManagedFeatureStyles(r, r.features[0])[1].getText().getText(), 'Forest');
    const legends = getPolygonLegendDescriptors(r, 'example');
    assert.deepEqual(legends.map(e => e.label), ['Description 0', 'Description 1']);
    assert.equal(legends[0].symbol.fillOpacity, 0.5);
    assert.equal(legends[0].symbol.stroke.opacity, 0.25);
    assert.equal(legends[1].symbol.stroke.enabled, false);
    setPolygonCategoryColor(r, categoryKey('Forest'), '#FF0000');
    assert.equal(style(r).getFill().getColor(), 'rgba(255, 0, 0, 0.3)');
    assert.equal(getPolygonLegendDescriptors(r, 'example')[1].symbol.fillColor, '#FF0000');
    r.symbology.importedStrokeEnabled = false; invalidatePolygonSymbology(r);
    assert.equal(style(r, 1).getStroke(), null);
    assert.equal(getPolygonLegendDescriptors(r, 'example')[0].symbol.stroke.enabled, false);
    assert.deepEqual(JSON.parse(JSON.stringify(r.symbology)), r.symbology);
});

test('failed matching leaves authoritative configuration and cached styles untouched', () => {
    const r = record();
    classifyPolygonLayer(r, 'kind');
    const before = JSON.stringify(r.symbology), cached = style(r);
    for (const sld of [{ ...parsed(), attribute: 'missing' }, parsed(['Never matches']),
        parsed(['Forest', 'Forest']), { ...parsed(), attribute: 'geometry' }]) {
        assert.throws(() => applyImportedPolygonStyle(r, sld));
        assert.equal(JSON.stringify(r.symbology), before);
        assert.equal(style(r), cached);
    }
    assert.throws(() => applyImportedPolygonStyle({ ...r, isPolygonLayer: false }, parsed()), /polygon/);
});

test('on-demand unmatched diagnostics retain exact values and distinguish unused rules from missing fallback paint', () => {
    // Synthetic counts reproduce the reported workload; these are not real data.
    const r = record([]);
    assert.equal(inspectImportedPolygonMatches(r), null);
    r.features = [...Array.from({ length: 12337 }, () => ({ properties: { kind: 'Example 0' } })),
        ...Array.from({ length: 36 }, (_, i) => ({ properties: { kind: `Example ${i + 1}` } })),
        ...['Example 0 ', 'example 0', null].map(kind => ({ properties: { kind } })), { properties: {} }];
    const report = applyImportedPolygonStyle(r, parsed(Array.from({ length: 55 }, (_, i) => `Example ${i}`)));
    assert.deepEqual(report, { ruleCount: 55, matchedFeatures: 12373, unmatchedFeatures: 4, unmatchedRules: 18 });
    const config = JSON.stringify(r.symbology);
    const diagnostics = inspectImportedPolygonMatches(r);
    assert.equal(diagnostics.totalFeatures, 12377);
    assert.equal(diagnostics.matchedFeatures, 12373);
    assert.equal(diagnostics.unmatchedFeatures, 4);
    assert.equal(diagnostics.unusedRules.length, 18);
    assert.deepEqual(diagnostics.unmatchedValues, [
        { value: 'Example 0 ', type: 'string', present: true, count: 1 },
        { value: 'example 0', type: 'string', present: true, count: 1 },
        { value: null, type: 'null', present: true, count: 1 },
        { value: null, type: 'undefined', present: false, count: 1 }
    ]);
    for (const f of r.features.slice(-4)) {
        const [style] = createManagedFeatureStyles(r, f);
        assert.equal(style.getFill(), null);
        assert.equal(style.getStroke(), null);
    }
    assert.equal(JSON.stringify(r.symbology), config, 'inspection does not mutate imported configuration');
    switchPolygonMode(r, 'single');
    assert.equal(inspectImportedPolygonMatches(r), null);
    switchPolygonMode(r, 'imported');
    r.features.push({ properties: { kind: 'Example 0 ' } });
    assert.equal(inspectImportedPolygonMatches(r).unmatchedValues[0].count, 2, 'inspection reads current features');
});

test('numeric and boolean equality conversion is explicit; strings retain exact whitespace and case', () => {
    for (const [values, literals, expected] of [[[1, 2], ['2', '1.0'], [2, 1]], [[true, false], ['0', 'true'], [false, true]],
        [[' a ', 'a'], [' a ', 'a'], [' a ', 'a']]]) {
        const r = record(values); applyImportedPolygonStyle(r, parsed(literals));
        assert.deepEqual(r.symbology.categories.map(c => c.value), expected);
        assert.equal(resolvePolygonCategory(r, r.features[0]).value, values[0]);
    }
    assert.throws(() => applyImportedPolygonStyle(record([1, '1']), parsed(['1'])), /mixed types/);
    assert.throws(() => applyImportedPolygonStyle(record([1]), parsed(['one'])), /numeric/);
    assert.throws(() => applyImportedPolygonStyle(record([true]), parsed(['yes'])), /boolean/);
    assert.throws(() => applyImportedPolygonStyle(record([null]), parsed()), /nonempty/);
    assert.throws(() => applyImportedPolygonStyle(record(['forest']), parsed(['Forest'])), /No SLD rule/);
    const r = record(['Forest']);
    assert.equal(applyImportedPolygonStyle(r, parsed()).unmatchedRules, 1);
    assert.equal(getPolygonLegendDescriptors(r, 'example')[0].count, 0);
});

test('replacement and switches retain imported edits, generated categories, single stroke and fill', () => {
    const r = record(); classifyPolygonLayer(r, 'kind');
    setPolygonCategoryColor(r, categoryKey('Forest'), '#FE1234');
    const original = JSON.stringify(r.symbology.categories);
    r.symbology.stroke.enabled = false;
    applyImportedPolygonStyle(r, parsed());
    assert.equal(style(r, 1).getStroke().getWidth(), 2.5);
    setPolygonCategoryColor(r, categoryKey('Water'), '#FEDCBA');
    switchPolygonMode(r, 'single');
    assert.equal(style(r).getStroke(), null);
    assert.equal(style(r).getFill().getColor(), 'rgba(37, 99, 235, 0.6)');
    switchPolygonMode(r, 'categorized');
    assert.equal(JSON.stringify(r.symbology.categories), original);
    switchPolygonMode(r, 'imported');
    assert.equal(r.symbology.categories[0].symbolizers[0].fill.color, '#FEDCBA');
    classifyPolygonLayer(r, 'second');
    assert.equal(r.symbology.provenance.type, 'generated');
    assert.equal(r.symbology.categories.length, 2);
    switchPolygonMode(r, 'imported');
    applyImportedPolygonStyle(r, parsed(['Forest']));
    assert.equal(r.symbology.categories.length, 1);
    switchPolygonMode(r, 'categorized');
    assert.equal(r.symbology.attribute, 'second');
    switchPolygonMode(r, 'imported');
    assert.equal(r.symbology.categories.length, 1);
    assert.equal(switchPolygonMode(r, 'invalid'), false);
    const single = record(); ensurePolygonSymbology(single);
    assert.equal(switchPolygonMode(single, 'imported'), false);
});

test('one unfiltered basic polygon rule can style every feature without a classification field', () => {
    const r = record();
    const sld = { ...parsed(['']), attribute: null };
    sld.rules[0].symbolizers[0].fill.enabled = false;
    applyImportedPolygonStyle(r, sld);
    assert.equal(getPolygonLegendDescriptors(r, 'all').length, 1);
    for (const f of r.features) assert.equal(resolvePolygonCategory(r, f), r.symbology.categories[0]);
    assert.equal(style(r).getFill(), null);
    assert.ok(style(r).getStroke());
});

test('zero-width imported stroke is absent, and special category values remain safe map keys', () => {
    const r = record(['__proto__', 'constructor']);
    const sld = parsed(['__proto__', 'constructor']);
    sld.rules[0].symbolizers[0].stroke.width = 0;
    applyImportedPolygonStyle(r, sld);
    assert.equal(style(r).getStroke(), null);
    assert.equal(getPolygonLegendDescriptors(r, 'example')[0].symbol.stroke.enabled, false);
    assert.equal(resolvePolygonCategory(r, r.features[0]).value, '__proto__');
    assert.equal({}.polluted, undefined);
    const plain = record(['Forest']);
    plain.features = [{ properties: { toString: 'Forest' } }, { properties: {} }];
    applyImportedPolygonStyle(plain, { ...parsed(['Forest']), attribute: 'toString' });
    assert.equal(plain.symbology.provenance.unmatchedFeatures, 1);
});

test('local file validation and unsafe declarations fail before browser XML parsing', () => {
    validateSldFile({ name: 'example.SLD', size: 100 });
    for (const file of [null, { name: 'style.xml', size: 1 }, { name: 'style.sld', size: 0 },
        { name: 'style.sld', size: SLD_LIMITS.bytes + 1 }]) assert.throws(() => validateSldFile(file));
    for (const xml of ['', 'x'.repeat(SLD_LIMITS.bytes + 1), '<!DOCTYPE x SYSTEM "https://example.invalid">', '<!ENTITY x "unsafe">']) assert.throws(() => parseSld(xml));
});

test('ordered solid symbolizers compile independently and share ordered legend descriptors', () => {
    const r = record(['Water']);
    const sld = parsed(['Water']);
    sld.rules[0].symbolizers.push({ type: 'polygon', fill: { enabled: false, color: '#FF0000', opacity: 0.2 },
        stroke: { enabled: true, color: '#001122', width: 7, opacity: 0.5 } });
    applyImportedPolygonStyle(r, sld);
    const styles = createManagedFeatureStyles(r, r.features[0]);
    assert.equal(styles.length, 2);
    assert.equal(styles[0].getFill().getColor(), 'rgba(18, 52, 86, 0.3)');
    assert.equal(styles[1].getFill(), null);
    assert.equal(styles[1].getStroke().getWidth(), 7);
    assert.equal(styles[1].getStroke().getColor(), 'rgba(0, 17, 34, 0.3)');
    assert.equal(createManagedFeatureStyles(r, r.features[0])[1], styles[1]);
    const [legend] = getPolygonLegendDescriptors(r, 'layered');
    assert.deepEqual(legend.symbols.map(s => s.stroke.width), [2.5, 7]);
    assert.deepEqual(legend.symbols.map(s => s.fillEnabled), [true, false]);
    r.symbology.importedStrokeEnabled = false; invalidatePolygonSymbology(r);
    assert.ok(createManagedFeatureStyles(r, r.features[0]).every(s => s.getStroke() === null));
    assert.ok(getPolygonLegendDescriptors(r, 'layered')[0].symbols.every(s => !s.stroke.enabled));
});

test('base color editing skips pattern and outline symbolizers and preserves all pattern definitions', () => {
    const r = record(['Water']);
    const sld = parsed(['Water']);
    const base = sld.rules[0].symbolizers[0];
    const pattern = { mark: 'hatch', size: 15, rotation: 45, opacity: 0.4,
        fill: { enabled: false, color: '#808080', opacity: 1 }, stroke: { enabled: true, color: '#000000', width: 1, opacity: 1 } };
    sld.rules[0].symbolizers = [
        { type: 'polygon', fill: { enabled: false }, stroke: { enabled: false } },
        { type: 'polygon', fill: { enabled: true, color: '#FF0000', pattern }, stroke: { enabled: false } }, base
    ];
    applyImportedPolygonStyle(r, sld);
    const before = JSON.stringify(r.symbology.categories[0].symbolizers.slice(0, 2));
    assert.ok(setPolygonCategoryColor(r, categoryKey('Water'), '#ABCD00'));
    assert.equal(JSON.stringify(r.symbology.categories[0].symbolizers.slice(0, 2)), before);
    assert.equal(getPolygonLegendDescriptors(r, 'layered')[0].baseFillColor, '#ABCD00');
    switchPolygonMode(r, 'single'); switchPolygonMode(r, 'categorized'); switchPolygonMode(r, 'imported');
    assert.equal(JSON.stringify(r.symbology.categories[0].symbolizers.slice(0, 2)), before);
    r.symbology.categories[0].symbolizers.pop();
    assert.equal(setPolygonCategoryColor(r, categoryKey('Water'), '#ABCD00'), false);
    assert.equal(getPolygonLegendDescriptors(r, 'layered')[0].baseFillColor, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(r.symbology)), r.symbology);
});
