import test from 'node:test';
import assert from 'node:assert/strict';
import Feature from 'ol/Feature.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import { createManagedFeatureStyles } from '../src/map/style-factory.js';
import { categoryKey, classifyPolygonLayer, discoverClassificationFields, ensurePolygonSymbology,
    getPolygonLegendDescriptors, invalidatePolygonSymbology, resolvePolygonCategory, setPolygonCategoryColor } from '../src/map/polygon-symbology.js';

function record(values = ['Forest', 'Water', null, undefined]) {
    return { isPolygonLayer: true, color: '#2563eb', polygonFillColor: '#2563eb', polygonStrokeColor: '#123456',
        polygonStrokeWidth: 2, opacity: 0.6, labelsVisible: false,
        features: values.map((kind, index) => new Feature({ kind, alternative: index % 2 === 0,
            objectid: index, geometry: index % 2 ? new MultiPolygon([]) : new Polygon([]) })) };
}
const style = (r, f = r.features[0]) => createManagedFeatureStyles(r, f)[0];

test('single mode retains defaults, legacy fields, labels and both polygon geometries', () => {
    const r = record();
    assert.equal(ensurePolygonSymbology(r).mode, 'single');
    for (const f of r.features) assert.equal(style(r, f).getFill().getColor(), 'rgba(37, 99, 235, 0.6)');
    assert.equal(style(r).getStroke().getWidth(), 2);
    r.polygonFillColor = '#FF0000';
    assert.equal(r.symbology.single.symbolizers[0].fill.color, '#FF0000');
    assert.equal(style(r).getFill().getColor(), 'rgba(255, 0, 0, 0.6)');
    r.labelsVisible = true; r.labelField = 'kind';
    assert.equal(createManagedFeatureStyles(r, r.features[0])[1].getText().getText(), 'Forest');
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(r.symbology)));
});

test('stroke visibility is backward compatible, cached, and shared by map and legends', () => {
    const r = record();
    const config = ensurePolygonSymbology(r);
    assert.equal(config.stroke.enabled, true);
    const initialStroke = style(r).getStroke();
    assert.equal(initialStroke.getWidth(), 2);
    for (const f of r.features) {
        config.stroke.enabled = false;
        invalidatePolygonSymbology(r);
        assert.equal(style(r, f).getStroke(), null);
        assert.equal(getPolygonLegendDescriptors(r, 'example')[0].symbol.stroke.enabled, false);
    }
    config.stroke.enabled = true;
    invalidatePolygonSymbology(r);
    assert.equal(style(r).getStroke().getWidth(), 2);
    assert.equal(style(r).getStroke().getColor(), 'rgba(18, 52, 86, 0.6)');

    classifyPolygonLayer(r, 'kind');
    const color = r.symbology.categories[0].symbolizers[0].fill.color;
    config.stroke.enabled = false;
    invalidatePolygonSymbology(r);
    assert.equal(style(r).getStroke(), null);
    assert.equal(getPolygonLegendDescriptors(r, 'example')[0].symbol.stroke.enabled, false);
    r.opacity = 0.3;
    setPolygonCategoryColor(r, config.categories[0].id, '#ABCDEF');
    assert.equal(config.stroke.enabled, false);
    assert.equal(style(r).getStroke(), null);
    assert.equal(style(r).getFill().getColor(), 'rgba(171, 205, 239, 0.3)');
    assert.notEqual(config.categories[1].symbolizers[0].fill.color, color);
    config.mode = 'single'; invalidatePolygonSymbology(r);
    assert.equal(config.stroke.enabled, false);
    assert.equal(style(r).getStroke(), null);
    config.mode = 'categorized'; invalidatePolygonSymbology(r);
    assert.equal(style(r).getStroke(), null);
});

test('legacy symbology without stroke visibility defaults to enabled', () => {
    const r = record();
    r.symbology = { mode: 'single', single: { symbolizers: [{ type: 'polygon', fill: { color: '#ABCDEF' } }] }, categories: [] };
    assert.equal(ensurePolygonSymbology(r).stroke.enabled, true);
});

test('discovery filters geometry, identifiers, objects and empty fields', () => {
    const r = record();
    r.features[0].set('object', { nested: true });
    r.features[0].set('empty', null);
    assert.deepEqual(discoverClassificationFields(r.features).map(f => f.field), ['alternative', 'kind']);
});

test('typed values, missing fallback, deterministic assignments and cached symbols', () => {
    const r = record([1, '1', true, 'true', '', null, undefined, 'Forest']);
    classifyPolygonLayer(r, 'kind');
    assert.equal(r.symbology.categories.length, 6);
    assert.equal(new Set(r.symbology.categories.map(c => c.symbolizers[0].fill.color)).size, 6);
    assert.notEqual(categoryKey(1), categoryKey('1'));
    assert.equal(resolvePolygonCategory(r, r.features[5]).id, 'missing');
    assert.equal(resolvePolygonCategory(r, new Feature()).id, 'missing');
    assert.equal(resolvePolygonCategory(r, new Feature({ kind: 'new' })).id, 'unmapped');
    assert.equal(resolvePolygonCategory(r, new Feature({ kind: {} })).id, 'unmapped');
    assert.equal(style(r), style(r));
    const before = JSON.stringify(r.symbology.categories);
    r.features.reverse(); classifyPolygonLayer(r, 'kind');
    assert.equal(JSON.stringify(r.symbology.categories), before);
    const reordered = record(r.features.map(f => f.get('kind')));
    classifyPolygonLayer(reordered, 'kind');
    assert.equal(JSON.stringify(reordered.symbology.categories), before);
});

test('colors, stroke, opacity and legend use the same configuration; single fill survives switching', () => {
    const r = record();
    classifyPolygonLayer(r, 'kind');
    const id = resolvePolygonCategory(r, r.features[0]).id;
    const other = style(r, r.features[1]).getFill().getColor();
    assert.equal(setPolygonCategoryColor(r, id, '#ABCDEF'), true);
    r.polygonStrokeWidth = 5; r.polygonStrokeColor = '#FF0000'; r.opacity = 0.25;
    invalidatePolygonSymbology(r);
    assert.equal(style(r).getFill().getColor(), 'rgba(171, 205, 239, 0.25)');
    assert.equal(style(r).getStroke().getWidth(), 5);
    assert.equal(style(r).getStroke().getColor(), 'rgba(255, 0, 0, 0.25)');
    const descriptors = getPolygonLegendDescriptors(r, 'example');
    const entry = descriptors.find(d => d.id === id);
    assert.equal(entry.symbol.fillColor, '#ABCDEF'); assert.equal(entry.symbol.opacity, 0.25);
    assert.equal(entry.layerIdentity, 'example');
    assert.ok(descriptors.some(d => d.id === 'missing')); assert.ok(descriptors.some(d => d.id === 'unmapped'));
    r.opacity = 0.6;
    assert.equal(style(r, r.features[1]).getFill().getColor(), other);
    r.symbology.mode = 'single'; invalidatePolygonSymbology(r);
    assert.equal(style(r).getFill().getColor(), 'rgba(37, 99, 235, 0.6)');
    assert.equal(getPolygonLegendDescriptors(r, 'example').length, 1);
    classifyPolygonLayer(r, 'alternative'); assert.equal(r.symbology.categories.length, 2);
});

test('high cardinality requires explicit confirmation with no truncation or partial mutation', () => {
    const r = record(Array.from({ length: 150 }, (_, i) => `value ${i}`));
    const config = ensurePolygonSymbology(r);
    assert.equal(discoverClassificationFields(r.features).find(f => f.field === 'kind').highCardinality, true);
    assert.deepEqual(classifyPolygonLayer(r, 'kind'), { requiresConfirmation: true, count: 150 });
    assert.equal(config.mode, 'single'); assert.equal(config.categories.length, 0);
    classifyPolygonLayer(r, 'kind', { confirmed: true });
    assert.equal(config.categories.length, 150);
    assert.equal(getPolygonLegendDescriptors(r, 'example').length, 152);
});

test('non-polygon legends are excluded and existing point/line styling remains functional', () => {
    for (const flag of ['isPointLayer', 'isLineLayer']) {
        const r = { ...record(), isPolygonLayer: false, [flag]: true, pointSize: 5, lineStrokeWidth: 3 };
        assert.deepEqual(getPolygonLegendDescriptors(r, 'example'), []);
        assert.equal(style(r).getFill().getColor(), 'rgba(37, 99, 235, 0.6)');
    }
});
