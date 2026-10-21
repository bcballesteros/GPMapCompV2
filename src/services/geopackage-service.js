import { validateGeoPackageFile } from './geopackage-reader.js';

/** One worker/database per selection; disposal cancels pending work immediately. */
export function createGeoPackageSession() {
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') throw new Error('GeoPackage import requires a browser with Web Workers and WebAssembly.');
    const worker = new Worker(new URL('./geopackage.worker.js', import.meta.url), { type: 'module' });
    const pending = new Map();
    let nextId = 0;
    let disposed = false;
    const dispose = () => {
        disposed = true;
        worker.terminate();
        for (const request of pending.values()) request.reject(new Error('GeoPackage selection was cancelled.'));
        pending.clear();
    };
    worker.onmessage = ({ data }) => {
        const request = pending.get(data.id);
        if (!request) return;
        pending.delete(data.id);
        if (data.error) { request.reject(new Error(data.error)); dispose(); }
        else request.resolve(data.result);
    };
    worker.onerror = event => {
        event.preventDefault();
        for (const request of pending.values()) request.reject(new Error('The GeoPackage runtime could not load or ran out of memory. Try a smaller file and check that worker/WASM assets are accessible.'));
        dispose();
    };
    const call = (operation, payload) => new Promise((resolve, reject) => {
        if (disposed) return reject(new Error('Select the GeoPackage again to reopen it.'));
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, operation, ...payload });
    });
    return {
        async open(file) { validateGeoPackageFile(file); return call('open', { file }); },
        async read(tables) { try { return await call('read', { tables }); } finally { dispose(); } },
        dispose
    };
}
