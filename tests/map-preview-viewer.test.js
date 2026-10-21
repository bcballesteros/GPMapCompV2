import assert from 'node:assert/strict';
import test from 'node:test';
import { constrainPreview } from '../src/ui/map-preview-viewer.js';

const base = { width: 3790, height: 6288, viewWidth: 900, viewHeight: 600 };
test('large multi-column compositions fit and pan to every edge without becoming lost', () => {
    const fit = 600 / 6288;
    const fitted = constrainPreview({ ...base, scale: fit, x: -10000, y: -10000 });
    assert.equal(fitted.scale, fit);
    assert.equal(fitted.y, 0);
    assert.ok(fitted.x > 0);
    assert.deepEqual(constrainPreview({ ...base, scale: 1, x: -1e9, y: -1e9 }), { scale: 1, x: -2890, y: -5688 });
    assert.deepEqual(constrainPreview({ ...base, scale: 1, x: 1e9, y: 1e9 }), { scale: 1, x: 0, y: 0 });
});
test('invalid and excessive zoom is bounded; resize recenters images that fit', () => {
    for (const scale of [NaN, Infinity, -Infinity, -2, 0, 100]) {
        const result = constrainPreview({ ...base, scale });
        assert.ok(Number.isFinite(result.scale) && result.scale > 0 && result.scale <= 8);
    }
    assert.deepEqual(constrainPreview({ width: 100, height: 80, viewWidth: 400, viewHeight: 300, scale: 1, x: -900, y: 500 }),
        { scale: 1, x: 150, y: 110 });
});
