import test from 'node:test';
import assert from 'node:assert/strict';
import { getManagedLayerLegendDescriptors } from '../src/map/layer-manager.js';
import { getState } from '../src/state/store.js';
import { generatePresetMarkerSvg } from '../src/map/style-factory.js';

function withRecord(name, record, run) {
    const layers = getState().uploadedLayers;
    layers[name] = record;
    try { run(); } finally { delete layers[name]; }
}

test('point and multipoint descriptors use effective preset marker and opacity', () => {
    for (const geometryType of ['Point', 'MultiPoint']) {
        const record = { isPointLayer: true, geometryType, color: '#123456', opacity: 0.4,
            pointSize: 8, markerPresetType: 'triangle', markerStrokeEnabled: true,
            markerStrokeColor: '#abcdef', markerStrokeWidth: 2 };
        withRecord('points', record, () => {
            const [entry] = getManagedLayerLegendDescriptors('points');
            assert.equal(entry.geometryType, geometryType);
            assert.equal(entry.symbolType, 'point');
            assert.equal(entry.symbol.opacity, 0.4);
            assert.equal(entry.symbol.size, 8);
            assert.equal(entry.symbol.src, generatePresetMarkerSvg('triangle', '#123456', '#abcdef', 2));
        });
    }
});

test('uploaded SVG previews and default circles follow point style precedence', () => {
    const svg = 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>';
    const record = { isPointLayer: true, geometryType: 'Point', color: '#123456', opacity: 1,
        pointSize: 6, markerPresetType: null, svgMarkerDataUrl: svg };
    withRecord('svg', record, () => {
        assert.equal(getManagedLayerLegendDescriptors('svg')[0].symbol.src.startsWith('data:image/svg+xml'), true);
    });
    record.svgMarkerDataUrl = null;
    withRecord('circle', record, () => assert.equal(getManagedLayerLegendDescriptors('circle')[0].symbol.src,
        generatePresetMarkerSvg('circle', '#123456', null, 0)));
});

test('line and multiline descriptors use effective color, width and opacity', () => {
    for (const geometryType of ['LineString', 'MultiLineString']) {
        const record = { isLineLayer: true, geometryType, color: '#ff0000', lineStrokeWidth: 7, opacity: 0.3 };
        withRecord('lines', record, () => {
            const [entry] = getManagedLayerLegendDescriptors('lines');
            assert.equal(entry.geometryType, geometryType);
            assert.deepEqual(entry.symbol, { type: 'line', color: '#ff0000', width: 7, opacity: 0.3 });
        });
    }
});

test('polygon descriptors retain category symbols and mixed layers have no misleading preview', () => {
    const polygon = { isPolygonLayer: true, geometryType: 'MultiPolygon', color: '#123456', opacity: 0.5 };
    withRecord('polygons', polygon, () => {
        const [entry] = getManagedLayerLegendDescriptors('polygons');
        assert.equal(entry.symbolType, 'polygon');
        assert.equal(entry.symbol.opacity, 0.5);
    });
    withRecord('mixed', { geometryType: 'Mixed', isPointLayer: false, isLineLayer: false, isPolygonLayer: false },
        () => assert.deepEqual(getManagedLayerLegendDescriptors('mixed'), []));
});
