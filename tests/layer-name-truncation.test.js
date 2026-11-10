import assert from 'node:assert/strict';
import test from 'node:test';
import { isLayerNameTruncated } from '../src/utils/layer-name-layout.js';

test('layer name truncation detects horizontal and vertical overflow', () => {
    assert.equal(isLayerNameTruncated({ scrollWidth: 103, clientWidth: 100, scrollHeight: 24, clientHeight: 24 }), true);
    assert.equal(isLayerNameTruncated({ scrollWidth: 100, clientWidth: 100, scrollHeight: 50, clientHeight: 48 }), true);
    assert.equal(isLayerNameTruncated({ scrollWidth: 100, clientWidth: 100, scrollHeight: 48, clientHeight: 48 }), false);
    assert.equal(isLayerNameTruncated(null), false);
});
