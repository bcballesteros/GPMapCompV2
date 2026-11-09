import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createServer } from 'vite';
import { browserSession } from './helpers/browser-session.js';

test('SVG marker gallery selection synchronizes point styling controls across repeated mode switches', {
    skip: !process.env.TEST_SVG_MARKER_BROWSER,
    timeout: 120000
}, async () => {
    const fixture = await readFile(new URL('./svg-marker-control-sync.browser.html', import.meta.url), 'utf8');
    const vite = await createServer({
        configFile: false,
        server: { host: '127.0.0.1', port: 0 },
        plugins: [{
            name: 'svg-marker-control-sync-test',
            configureServer(server) {
                server.middlewares.use('/__svg_marker_control_test', (_request, response) => {
                    response.setHeader('Content-Type', 'text/html');
                    response.end(fixture);
                });
            }
        }]
    });
    try {
        await vite.listen();
        const { port } = vite.httpServer.address();
        const result = await browserSession(async call => {
            await call('Page.navigate', { url: `http://127.0.0.1:${port}/__svg_marker_control_test` });
            const deadline = Date.now() + 10000;
            while (Date.now() < deadline) {
                const ready = await call('Runtime.evaluate', { expression: 'Boolean(window.fixtureReady)', returnByValue: true });
                if (ready.result.value) {
                    const evaluation = await call('Runtime.evaluate', {
                        expression: 'window.fixtureReady.then(run => run())',
                        awaitPromise: true,
                        returnByValue: true
                    });
                    return evaluation.result.value;
                }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            throw new Error('SVG marker browser fixture did not finish loading.');
        });
        assert.deepEqual(result, { passed: true });
    } finally {
        await vite.close();
    }
});
