import { unByKey } from 'ol/Observable.js';
import TileState from 'ol/TileState.js';

export class MapRenderError extends Error {
    constructor(message) {
        super(message);
        this.name = 'MapRenderError';
    }
}

// For static output, create this observer while the map has no target. Counting
// source events alone cannot establish readiness: tiles may still be queued,
// and OpenLayers can finish rendering even when a tile is in the ERROR state.
export function observeMapRender(map, {
    sources,
    rejectLoadErrors = false,
    timeoutMs = 45000,
    debug = () => {}
}) {
    const uniqueSources = [...new Set(sources)];
    const resources = new Map();
    const keys = [];
    const counts = { tileLoadStarts: 0, successfulTileLoads: 0, tileErrors: 0 };
    let revision = 0;
    let candidateRevision = null;
    let confirmationRendered = false;
    let animationFrameId = null;
    let timeoutId = null;
    let settled = false;
    let resolveReady;
    let rejectReady;

    const ready = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    // Setup may throw before the caller reaches await ready. Keep cancellation
    // from becoming an unhandled rejection while retaining the rejected promise.
    ready.catch(() => {});

    const snapshot = () => {
        let unresolved = 0;
        let failed = 0;
        let loaded = 0;
        for (const states of resources.values()) {
            for (const [resource, observedState] of states) {
                const state = resource.getState?.() ?? observedState;
                if (state === TileState.ERROR) {
                    failed += 1;
                } else if (state === TileState.LOADED) {
                    loaded += 1;
                } else if (state !== TileState.EMPTY) {
                    unresolved += 1;
                }
            }
        }
        return { sourceCount: uniqueSources.length, ...counts, loaded, unresolved, failed };
    };

    const cleanup = () => {
        keys.forEach(unByKey);
        keys.length = 0;
        clearTimeout(timeoutId);
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    };

    const fail = (message) => {
        if (settled) {
            return;
        }
        settled = true;
        debug('map-readiness:failed', { ...snapshot(), message });
        cleanup();
        rejectReady(new MapRenderError(message));
    };

    const recordLoad = (source, eventName, event) => {
        const resource = event.tile || event.image;
        const state = eventName.endsWith('start') ? TileState.LOADING
            : eventName.endsWith('error') ? TileState.ERROR : TileState.LOADED;
        if (resource) {
            resources.get(source).set(resource, state);
        }
        revision += 1;
        candidateRevision = null;
        confirmationRendered = false;
        if (eventName.startsWith('tile')) {
            if (state === TileState.LOADING) counts.tileLoadStarts += 1;
            if (state === TileState.LOADED && (resource?.getState?.() ?? state) === TileState.LOADED) {
                counts.successfulTileLoads += 1;
            }
            if (state === TileState.ERROR) counts.tileErrors += 1;
        }
        debug(`source-load:${eventName}`, {
            ...snapshot(), sourceType: source.constructor.name, sourceState: source.getState()
        });
        if (rejectLoadErrors && state === TileState.ERROR) {
            fail('A visible map tile or image failed to load');
        }
        // Never resolve on loadend: the successful tile still needs to be drawn.
    };

    uniqueSources.forEach((source) => {
        resources.set(source, new Map());
        for (const eventName of [
            'tileloadstart', 'tileloadend', 'tileloaderror',
            'imageloadstart', 'imageloadend', 'imageloaderror'
        ]) {
            keys.push(source.on(eventName, (event) => recordLoad(source, eventName, event)));
        }
    });

    keys.push(map.on('rendercomplete', () => {
        if (settled) {
            return;
        }
        const status = snapshot();
        debug('map-rendercomplete', status);
        if (rejectLoadErrors && (status.failed || uniqueSources.some((source) => source.getState() === 'error'))) {
            fail('A visible map source failed to load');
            return;
        }
        const view = map.getView();
        if (status.unresolved || view.getAnimating() || view.getInteracting()) {
            candidateRevision = null;
            return;
        }
        if (candidateRevision === revision && confirmationRendered) {
            settled = true;
            cleanup();
            debug('map-readiness:ready', status);
            resolveReady(status);
            return;
        }

        candidateRevision = revision;
        if (animationFrameId === null) {
            // Confirm a new completed frame with no intervening load activity.
            // This is a frame boundary, not a fixed tile-loading delay.
            animationFrameId = requestAnimationFrame(() => {
                animationFrameId = null;
                confirmationRendered = true;
                map.renderSync();
            });
        }
    }));

    timeoutId = setTimeout(() => fail('Map rendering did not complete before the deadline'), timeoutMs);
    debug('map-readiness:observing', snapshot());

    return {
        ready,
        snapshot,
        dispose() {
            if (!settled) {
                fail('Map rendering was cancelled');
            }
            cleanup();
        }
    };
}
