import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import Observable from 'ol/Observable.js';
import Tile from 'ol/Tile.js';
import TileState from 'ol/TileState.js';
import { MapRenderError, observeMapRender } from '../src/services/map-render-readiness.js';

let frames;
let observers;
let nextFrame;

beforeEach(() => {
    frames = new Map();
    observers = [];
    nextFrame = 0;
    globalThis.requestAnimationFrame = (callback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
    };
    globalThis.cancelAnimationFrame = (id) => frames.delete(id);
});

afterEach(() => {
    observers.forEach((observer) => observer.dispose());
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
});

function setup(options = {}) {
    const map = new Observable();
    const source = new Observable();
    source.getState = () => 'ready';
    map.getView = () => ({ getAnimating: () => false, getInteracting: () => false });
    map.renderSync = () => {};
    const observer = observeMapRender(map, { sources: [source, source], rejectLoadErrors: true, ...options });
    observers.push(observer);
    return { map, source, observer };
}

function flushFrame() {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
}

function tileEvent(source, tile, type, state) {
    tile.setState(state);
    source.dispatchEvent({ type, tile });
}

function assertClean(map, source) {
    assert.equal(map.hasListener('rendercomplete'), false);
    for (const event of ['tileloadstart', 'tileloadend', 'tileloaderror', 'imageloadstart', 'imageloadend', 'imageloaderror']) {
        assert.equal(source.hasListener(event), false);
    }
    assert.equal(frames.size, 0);
}

test('zero counted loads and loadend alone never establish a rendered frame', async () => {
    const { map, source, observer } = setup();
    let ready = false;
    observer.ready.then(() => { ready = true; });
    const tile = new Tile([1, 0, 0], TileState.IDLE);
    tileEvent(source, tile, 'tileloadstart', TileState.LOADING);
    tileEvent(source, tile, 'tileloadend', TileState.LOADED);
    await Promise.resolve();
    assert.equal(ready, false);
    assert.equal(observer.snapshot().sourceCount, 1);

    map.dispatchEvent('rendercomplete');
    map.dispatchEvent('rendercomplete'); // Duplicate notification for the first frame.
    await Promise.resolve();
    assert.equal(ready, false);
    flushFrame();
    map.dispatchEvent('rendercomplete');
    const status = await observer.ready;
    assert.equal(status.unresolved, 0);
    assert.equal(status.failed, 0);
    assert.equal(status.successfulTileLoads, 1);
    assertClean(map, source);
});

test('new load activity invalidates a prior complete frame', async () => {
    const { map, source, observer } = setup();
    let ready = false;
    observer.ready.then(() => { ready = true; });
    map.dispatchEvent('rendercomplete');
    const tile = new Tile([1, 0, 0], TileState.IDLE);
    tileEvent(source, tile, 'tileloadstart', TileState.LOADING);
    flushFrame();
    map.dispatchEvent('rendercomplete');
    tileEvent(source, tile, 'tileloadend', TileState.LOADED);
    await Promise.resolve();
    assert.equal(ready, false);
    map.dispatchEvent('rendercomplete');
    flushFrame();
    map.dispatchEvent('rendercomplete');
    await observer.ready;
    assertClean(map, source);
});

test('tile failure rejects immediately instead of counting as a successful load', async () => {
    const { map, source, observer } = setup();
    map.dispatchEvent('rendercomplete');
    const tile = new Tile([1, 0, 0], TileState.IDLE);
    tileEvent(source, tile, 'tileloadstart', TileState.LOADING);
    tileEvent(source, tile, 'tileloaderror', TileState.ERROR);
    await assert.rejects(observer.ready, MapRenderError);
    assert.equal(observer.snapshot().failed, 1);
    assert.equal(observer.snapshot().successfulTileLoads, 0);
    assert.equal(observer.snapshot().tileErrors, 1);
    assertClean(map, source);
});

test('a failed public tile state blocks capture even without a tileloaderror event', async () => {
    const { map, source, observer } = setup();
    const tile = new Tile([1, 0, 0], TileState.IDLE);
    tileEvent(source, tile, 'tileloadstart', TileState.LOADING);
    tile.setState(TileState.ERROR);
    map.dispatchEvent('rendercomplete');
    await assert.rejects(observer.ready, MapRenderError);
    assertClean(map, source);
});

test('duplicate end events cannot hide a different tile still loading', async () => {
    const { map, source, observer } = setup();
    const first = new Tile([1, 0, 0], TileState.IDLE);
    const second = new Tile([1, 0, 1], TileState.IDLE);
    tileEvent(source, first, 'tileloadstart', TileState.LOADING);
    tileEvent(source, second, 'tileloadstart', TileState.LOADING);
    tileEvent(source, first, 'tileloadend', TileState.LOADED);
    source.dispatchEvent({ type: 'tileloadend', tile: first });
    map.dispatchEvent('rendercomplete');
    assert.equal(observer.snapshot().unresolved, 1);
    assert.equal(frames.size, 0);
    tileEvent(source, second, 'tileloadend', TileState.LOADED);
    map.dispatchEvent('rendercomplete');
    flushFrame();
    map.dispatchEvent('rendercomplete');
    await observer.ready;
});

test('a cancelled empty tile is terminal but is not reported as a loaded tile', async () => {
    const { map, source, observer } = setup();
    const tile = new Tile([1, 0, 0], TileState.IDLE);
    tileEvent(source, tile, 'tileloadstart', TileState.LOADING);
    tile.setState(TileState.EMPTY);
    map.dispatchEvent('rendercomplete');
    flushFrame();
    map.dispatchEvent('rendercomplete');
    const status = await observer.ready;
    assert.equal(status.loaded, 0);
    assert.equal(status.unresolved, 0);
});

test('image errors and source errors also reject static capture', async () => {
    const first = setup();
    first.source.dispatchEvent({ type: 'imageloaderror', image: {} });
    await assert.rejects(first.observer.ready, MapRenderError);
    assertClean(first.map, first.source);
    const second = setup();
    second.source.getState = () => 'error';
    second.map.dispatchEvent('rendercomplete');
    await assert.rejects(second.observer.ready, MapRenderError);
    assertClean(second.map, second.source);
});

test('deadline rejects a hanging render and cleans listeners', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { map, source, observer } = setup();
    t.mock.timers.tick(45000);
    await assert.rejects(observer.ready, /deadline/);
    assertClean(map, source);
});

test('disposal cancels observation and removes listeners and pending frames', async () => {
    const { map, source, observer } = setup();
    map.dispatchEvent('rendercomplete');
    observer.dispose();
    await assert.rejects(observer.ready, /cancelled/);
    assertClean(map, source);
});
