import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeHex, hexToHsv, hsvToHex } from '../src/ui/vector-color-picker.js';

test('HEX accepts shorthand and six digits, rejecting unsafe and incomplete values', () => {
    assert.equal(normalizeHex(' #abc '), '#AABBCC');
    assert.equal(normalizeHex('12aBcD'), '#12ABCD');
    for (const value of ['', '#12', '#12345', '#12345678', '#gggggg', '<script>', null]) {
        assert.equal(normalizeHex(value), null);
    }
});

test('visual picker preserves exact RGB values through HSV, including grayscale', () => {
    for (const color of ['#000000', '#FFFFFF', '#808080', '#FF0000', '#00FF00', '#0000FF', '#2563EB', '#AB12CD']) {
        assert.equal(hsvToHex(hexToHsv(color)), color);
    }
    assert.equal(hexToHsv('invalid'), null);
});
