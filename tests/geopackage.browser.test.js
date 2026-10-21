import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createServer, preview } from 'vite';
import { makeGeoPackage, makePointShapefileZip } from './helpers/geopackage-fixture.js';
import { browserSession } from './helpers/browser-session.js';

for (const production of [false, true]) {
    test(`GeoPackage full upload UI, managed layers and output (${production ? 'production build' : 'Vite dev'})`, {
        skip: !process.env.TEST_GPKG_BROWSER, timeout: 120000
    }, async t => {
        const server = production
            ? await preview({ preview: { host: '127.0.0.1', port: 0, open: false } })
            : await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
        if (!production) await server.listen();
        try {
            const port = server.httpServer.address().port;
            const result = await browserSession(async call => {
                await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.__testState = {}; window.__testErrors = []; window.addEventListener('error', event => window.__testErrors.push(event.message)); window.addEventListener('unhandledrejection', event => window.__testErrors.push(String(event.reason))); window.addEventListener('gpmap:statechange', event => { window.__testState[event.detail.key] = event.detail.value; });` });
                await call('Network.enable');
                await call('Network.setBlockedURLs', { urls: ['https://*', 'http://192.168.*'] });
                await call('Page.navigate', { url: `http://127.0.0.1:${port}/GPMapCompV2/` });
                const bytes = await readFile(new URL('./fixtures/vector-multitable.gpkg', import.meta.url));
                const bad = makeGeoPackage([{ name: 'good' }, { name: 'bad', nullGeometry: true }]);
                const mercator = makeGeoPackage([{ name: 'mercator', srsId: 3857, geometry: { type: 'Point', coordinates: [13469658.385986103, 1574216.548161465] } }]);
                const script = await readFile(new URL('./geopackage.browser.js', import.meta.url), 'utf8');
                const evaluation = await call('Runtime.evaluate', {
                    expression: `(async () => { const fixtures = ${JSON.stringify({ valid: Buffer.from(bytes).toString('base64'), bad: Buffer.from(bad).toString('base64'), mercator: Buffer.from(mercator).toString('base64'), shapefile: Buffer.from(makePointShapefileZip()).toString('base64') })}; ${script}\n return runGeoPackageBrowser(fixtures); })()`,
                    awaitPromise: true, returnByValue: true
                });
                const targets = await call('Target.getTargets');
                assert.equal(targets.targetInfos.filter(target => target.type === 'worker').length, 0, 'All GeoPackage workers are terminated after import/clear/failure');
                return evaluation.result.value;
            });
            assert.equal(result.layers, 9);
            assert.deepEqual(result.formats, ['image/png', 'image/jpeg', 'application/pdf']);
            t.diagnostic(JSON.stringify({ production, ...result }));
        } finally {
            if (production) await new Promise((resolveClose, reject) => server.httpServer.close(error => error ? reject(error) : resolveClose()));
            else await server.close();
        }
    });
}
