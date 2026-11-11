import assert from 'node:assert/strict';
import test from 'node:test';
import Group from 'ol/layer/Group.js';
import Vector from 'ol/layer/Vector.js';
import { applyOverlayOrder, eligibleOverlays, insertOrderedOverlay, prepareOrderedBasemap } from '../src/map/overlay-order.js';
import { topToBottomLayers } from '../src/utils/layer-list-layout.js';

function fixture() {
    const base = new Vector({ properties: { basemapId: 'test' } });
    const vector = new Vector({ opacity: 0.42, visible: false });
    const wms = new Vector({ zIndex: 100 });
    const gp = new Vector({ zIndex: 101 });
    const operational = new Vector();
    const nested = new Group({ zIndex: 500, layers: [vector] });
    const group = new Group({ layers: [base, nested, wms, gp, operational] });
    const map = { getLayerGroup: () => group, getLayers: () => group.getLayers(), dispatchEvent() {} };
    const eligible = [vector, wms, gp];
    return { map, base, vector, wms, gp, operational, eligible,
        order: () => topToBottomLayers(map).filter(layer => eligible.includes(layer)) };
}

test('cross-source moves override explicit and inherited z-index, retaining objects and collections', () => {
    const f = fixture();
    const collection = f.map.getLayers().getArray().slice();
    assert.deepEqual(f.order(), [f.vector, f.gp, f.wms]);
    const source = f.vector.getSource();
    const style = f.vector.getStyle();
    for (const order of [[f.wms, f.vector, f.gp], [f.gp, f.wms, f.vector], [f.vector, f.gp, f.wms]]) {
        assert.equal(applyOverlayOrder(f.map, f.eligible, order), true);
        assert.deepEqual(f.order(), order);
        assert.deepEqual(topToBottomLayers(f.map), [f.operational, ...order, f.base]);
    }
    assert.deepEqual(f.map.getLayers().getArray(), collection);
    assert.equal(f.vector.getVisible(), false);
    assert.equal(f.vector.getOpacity(), 0.42);
    assert.equal(f.vector.getSource(), source);
    assert.equal(f.vector.getStyle(), style);
    assert.equal(f.operational.getZIndex(), undefined);
});

test('invalid, unchanged, empty and single-layer requests do not establish ordering', () => {
    const f = fixture();
    assert.equal(applyOverlayOrder(f.map, f.eligible, f.order()), false);
    for (const order of [[], [f.gp], [f.gp, f.gp, f.wms], [f.base, f.vector, f.wms]]) {
        assert.equal(applyOverlayOrder(f.map, f.eligible, order), false);
    }
    assert.equal(applyOverlayOrder(f.map, [], []), false);
    assert.equal(applyOverlayOrder(f.map, [f.vector], [f.vector]), false);
    insertOrderedOverlay(f.map, f.eligible, f.wms);
    assert.equal(f.wms.getZIndex(), 100);
    assert.equal(f.base.getZIndex(), undefined);
});

test('repeated moves stay bounded; additions, removals, renames and basemap replacement preserve relative order', () => {
    const f = fixture();
    for (let i = 0; i < 50; i++) {
        const order = f.order();
        order.push(order.shift());
        applyOverlayOrder(f.map, f.eligible, order);
        assert.deepEqual(f.order(), order);
        assert(f.eligible.every(layer => layer.getZIndex() > -1 && layer.getZIndex() < 0));
    }
    const previous = f.order();
    for (const zIndex of [undefined, 100, 101]) {
        const added = new Vector({ zIndex });
        f.map.getLayers().push(added);
        f.eligible.push(added);
        insertOrderedOverlay(f.map, f.eligible, added);
        assert.deepEqual(f.order().slice(1), previous);
        assert.equal(f.order()[0], added);
        f.map.getLayers().remove(added);
        f.eligible.pop();
    }
    const replacement = prepareOrderedBasemap(f.map, new Vector({ properties: { basemapId: 'replacement' } }));
    f.map.getLayers().setAt(0, replacement);
    assert.equal(replacement.getZIndex(), -1);
    assert.deepEqual(f.order(), previous);
    const records = { renamed: { layer: f.vector, geojson: {} }, wms: { layer: f.wms, isWMS: true },
        drawing: { layer: f.operational }, annotation: { layer: f.operational, isAnnotation: true } };
    assert.deepEqual(eligibleOverlays(records), [f.vector, f.wms]);
    f.map.getLayers().remove(f.wms);
    assert.deepEqual(f.order(), previous.filter(layer => layer !== f.wms));
});
