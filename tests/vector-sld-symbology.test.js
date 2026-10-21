import test from 'node:test';
import assert from 'node:assert/strict';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import LineString from 'ol/geom/LineString.js';
import MultiLineString from 'ol/geom/MultiLineString.js';
import { createManagedFeatureStyles } from '../src/map/style-factory.js';
import { applyImportedVectorStyle, switchVectorStyleMode, getImportedVectorLegendDescriptors } from '../src/map/vector-sld-symbology.js';
import { getSymbologyRuntime, inspectImportedMatches, invalidateSymbology } from '../src/map/symbology-common.js';
import { getManagedLayerLegendDescriptors, updateManagedLayerStyle, removeManagedLayer } from '../src/map/layer-manager.js';
import { getState } from '../src/state/store.js';

const symbol = type => ({ type, shape: 'square', size: 16, rotation: 30, opacity: 0.5,
    fill: { enabled: true, color: '#E63946', opacity: 0.5 },
    stroke: { enabled: true, color: '#123456', opacity: 0.25, width: 2, dashArray: [5, 3], lineCap: 'square', lineJoin: 'bevel' } });
const parsed = (type, values = ['second', 'first', 'unused']) => ({ geometryType: type, sldVersion: '1.0.0', title: 'Test', attribute: 'kind',
    rules: values.map((literal, i) => ({ literal, name: `rule ${i}`, label: `Label ${i}`, symbolizers: [symbol(type)] })) });
function record(type, values = ['first', 'second', null, 'other']) {
    const geometries = type === 'point' ? [Point, MultiPoint] : [LineString, MultiLineString];
    return { isPointLayer: type === 'point', isLineLayer: type === 'line', opacity: 0.6, color: '#2563eb', pointSize: 7,
        markerPresetType: null, svgMarkerDataUrl: null, lineStrokeWidth: 3, geometryType: type === 'point' ? 'Point' : 'LineString',
        features: values.map((kind, i) => new Feature({ kind, geometry: new geometries[i % 2]([]) })) };
}

for (const type of ['point', 'line']) {
    test(`${type}: typed ordered categories, unmatched diagnostics, labels, shared legends and cached styles`, () => {
        const r = record(type);
        const result = applyImportedVectorStyle(r, parsed(type), 'example.sld');
        assert.deepEqual(result, { ruleCount: 3, matchedFeatures: 2, unmatchedFeatures: 2, unmatchedRules: 1 });
        assert.deepEqual(r.symbology.categories.map(c => c.value), ['second', 'first', 'unused']);
        assert.equal(r.symbology.provenance.fileName, 'example.sld');
        assert.deepEqual(JSON.parse(JSON.stringify(r.symbology)), r.symbology);
        r.labelsVisible = true; r.labelField = 'kind';
        const styles = createManagedFeatureStyles(r, r.features[0]);
        assert.notEqual(styles[0], createManagedFeatureStyles(r, r.features[1])[0]); // distinct rule cache entries
        assert.equal(styles[0], createManagedFeatureStyles(r, r.features[0])[0]);
        assert.notEqual(styles[1], createManagedFeatureStyles(r, r.features[0])[1]);
        assert.equal(styles[1].getText().getText(), 'first');
        assert.equal(createManagedFeatureStyles(r, r.features[2]).length, 0);
        assert.equal(createManagedFeatureStyles(r, r.features[3]).length, 1, 'unmatched can retain separate existing label only');
        const legends = getImportedVectorLegendDescriptors(r, 'Example');
        assert.deepEqual(legends.map(e => e.label), ['Label 0', 'Label 1', 'Label 2']);
        assert.equal(legends[0].symbols[0].opacity, 0.3);
        assert.equal(legends[0].symbols[0].stroke.opacity, 0.25);
        const report = inspectImportedMatches(r);
        assert.equal(report.unmatchedFeatures, 2); assert.equal(report.unusedRules.length, 1);
        const native = type === 'point' ? styles[0].getImage() : styles[0];
        assert.equal(native.getStroke().getWidth(), 2);
        assert.deepEqual(native.getStroke().getLineDash(), [5, 3]);
        assert.equal(native.getStroke().getLineCap(), 'square');
        assert.equal(native.getStroke().getLineJoin(), 'bevel');
        if (type === 'point') {
            assert.equal(native.getRadius(), 16 / Math.SQRT2);
            assert.equal(native.getRotation(), Math.PI / 6);
            assert.equal(native.getOpacity(), 0.3);
            assert.equal(native.getFill().getColor(), 'rgba(230, 57, 70, 0.5)');
            assert.equal(native.getStroke().getColor(), 'rgba(18, 52, 86, 0.25)');
        } else assert.equal(native.getStroke().getColor(), 'rgba(18, 52, 86, 0.075)');
    });

    test(`${type}: incompatible/missing/mixed/duplicate/unmatched imports preserve prior configuration and cache`, () => {
        const r = record(type); applyImportedVectorStyle(r, parsed(type));
        const snapshot = JSON.stringify(r.symbology), cached = createManagedFeatureStyles(r, r.features[0])[0];
        for (const candidate of [{ ...parsed(type), attribute: 'absent' }, parsed(type, ['never']), parsed(type, ['first', 'first']), parsed(type === 'point' ? 'line' : 'point')]) {
            assert.throws(() => applyImportedVectorStyle(r, candidate));
            assert.equal(JSON.stringify(r.symbology), snapshot);
            assert.equal(createManagedFeatureStyles(r, r.features[0])[0], cached);
        }
        assert.throws(() => applyImportedVectorStyle(record(type, [1, '1']), parsed(type, ['1'])), /mixed/);
        for (const [values, literals] of [[[1, 2], ['2', '1']], [[true, false], ['false', 'true']]]) {
            const typed = record(type, values); applyImportedVectorStyle(typed, parsed(type, literals));
            assert.deepEqual(typed.symbology.categories.map(c => c.value), values.toReversed());
        }
    });

    test(`${type}: uniform and layered symbols, replacement, mode switching and opacity invalidation`, () => {
        const r = record(type);
        const sld = parsed(type, ['first']); sld.attribute = null;
        sld.rules[0].literal = null; sld.rules[0].symbolizers.push({ ...symbol(type), stroke: { ...symbol(type).stroke, enabled: false } });
        applyImportedVectorStyle(r, sld);
        const styles = createManagedFeatureStyles(r, r.features[0]);
        assert.equal(styles.length, 2);
        assert.equal((type === 'point' ? styles[1].getImage() : styles[1]).getStroke(), null);
        switchVectorStyleMode(r, 'manual');
        const manual = createManagedFeatureStyles(r, r.features[0])[0];
        assert.equal(manual.getStroke().getColor(), 'rgba(37, 99, 235, 0.6)');
        assert.equal(r.pointSize, 7); assert.equal(r.lineStrokeWidth, 3);
        switchVectorStyleMode(r, 'imported');
        assert.notEqual(createManagedFeatureStyles(r, r.features[0])[0], styles[0]);
        r.opacity = 0.2; invalidateSymbology(r);
        const changed = createManagedFeatureStyles(r, r.features[0])[0];
        assert.notEqual(changed, styles[0]);
        if (type === 'point') assert.equal(changed.getImage().getOpacity(), 0.1);
        else assert.equal(changed.getStroke().getColor(), 'rgba(18, 52, 86, 0.025)');
        sld.rules[0].symbolizers[0].stroke.color = '#FF0000'; applyImportedVectorStyle(r, sld, 'replacement.sld');
        assert.equal(r.symbology.provenance.fileName, 'replacement.sld');
        assert.notEqual(createManagedFeatureStyles(r, r.features[0])[0], changed);
    });
}

test('all supported native point shapes retain rotation and zero-width stroke remains disabled', () => {
    for (const shape of ['circle', 'square', 'triangle', 'star']) {
        const r = record('point'), sld = parsed('point');
        sld.rules[0].symbolizers[0].shape = shape; sld.rules[0].symbolizers[0].stroke.width = 0;
        applyImportedVectorStyle(r, sld);
        const image = createManagedFeatureStyles(r, r.features[1])[0].getImage();
        assert.equal(image.getStroke(), null);
        assert.equal(image.getRotation(), Math.PI / 6);
        assert.equal(image.getRadius(), shape === 'square' ? 16 / Math.SQRT2 : 8);
    }
});

test('managed updates refresh imported cache/legends and removal clears runtime', () => {
    const r = record('line'), state = getState();
    applyImportedVectorStyle(r, parsed('line'));
    let changed = 0, removed = false;
    r.layer = { setStyle(fn) { this.style = fn; }, changed() { changed++; } };
    state.uploadedLayers.Test = r;
    const oldMap = state.map, oldWindow = globalThis.window, oldEvent = globalThis.CustomEvent;
    globalThis.window = { dispatchEvent() {} }; globalThis.CustomEvent = class {};
    state.map = { removeLayer(layer) { removed = layer === r.layer; } };
    try {
        const runtime = getSymbologyRuntime(r);
        updateManagedLayerStyle('Test');
        assert.notEqual(getSymbologyRuntime(r), runtime); assert.equal(changed, 1);
        assert.equal(getManagedLayerLegendDescriptors('Test').length, 3);
        const after = getSymbologyRuntime(r);
        removeManagedLayer('Test');
        assert.ok(removed); assert.equal(state.uploadedLayers.Test, undefined);
        assert.notEqual(getSymbologyRuntime(r), after);
    } finally { delete state.uploadedLayers.Test; state.map = oldMap; globalThis.window = oldWindow; globalThis.CustomEvent = oldEvent; }
});
