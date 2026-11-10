import assert from 'node:assert/strict';
import test from 'node:test';
import Group from 'ol/layer/Group.js';
import Vector from 'ol/layer/Vector.js';
import { layerSourceType, layerSubtitle, topToBottomLayers } from '../src/utils/layer-list-layout.js';

test('effective order uses real OpenLayers states, inherited z-index and collection ties', () => {
    const low = new Vector();
    const first = new Vector({ zIndex: 100 });
    const last = new Vector({ zIndex: 100, visible: false });
    const inherited = new Vector();
    const group = new Group({ layers: [first, low, last, new Group({ zIndex: 101, layers: [inherited] })] });
    const map = { getLayerGroup: () => group };
    const original = group.getLayers().getArray().slice();
    assert.deepEqual(topToBottomLayers(map), [inherited, last, first, low]);
    assert.deepEqual(group.getLayers().getArray(), original);
    assert.equal(low.getZIndex(), undefined);
    low.setZIndex(200);
    assert.equal(topToBottomLayers(map)[0], low);
    assert.equal(last.getVisible(), false);
    assert.deepEqual(topToBottomLayers(null), []);
});

test('source metadata identifies services, mixed and empty vectors without invented counts', () => {
    for (const [record, expected] of [
        [{ isGP: true, isWMS: true }, 'Geoportal'], [{ isWMS: true }, 'WMS'],
        [{ geojson: { features: [] } }, 'Vector'], [{ isPointLayer: true }, 'Vector'],
        [{ isLineLayer: true }, 'Vector'], [{ isPolygonLayer: true }, 'Vector'],
        [{ isAnnotation: true }, 'Annotation'], [{}, 'Other']
    ]) assert.equal(layerSourceType(record), expected);
    assert.equal(layerSubtitle('Vector', 12377), 'Vector · 12,377 Features');
    assert.equal(layerSubtitle('Vector', 1), 'Vector · 1 Feature');
    assert.equal(layerSubtitle('Vector', 0), 'Vector · 0 Features');
    assert.equal(layerSubtitle('Vector'), 'Vector');
    assert.equal(layerSubtitle('WMS', 0), 'WMS · Map Service');
    assert.equal(layerSubtitle('Geoportal', 0), 'Geoportal · Map Service');
});
