import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { createServer } from 'vite';
import { browserSession } from './helpers/browser-session.js';

test('unified Layers panel preserves map order, controls, names and lifecycle', {
    skip: !process.env.TEST_LAYERS_BROWSER,
    timeout: 120000
}, async () => {
    const fixture = await readFile(new URL('./layers-panel.browser.html', import.meta.url), 'utf8');
    const vite = await createServer({
        configFile: false,
        server: { host: '127.0.0.1', port: 0 },
        plugins: [{
            name: 'layers-panel-test',
            configureServer(server) {
                server.middlewares.use('/__layers_panel_test', (_request, response) => {
                    response.setHeader('Content-Type', 'text/html; charset=utf-8');
                    response.end(fixture);
                });
            }
        }]
    });
    try {
        await vite.listen();
        const { port } = vite.httpServer.address();
        const result = await browserSession(async call => {
            await call('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
            await call('Page.navigate', { url: `http://127.0.0.1:${port}/__layers_panel_test` });
            const deadline = Date.now() + 10000;
            while (Date.now() < deadline) {
                const ready = await call('Runtime.evaluate', { expression: 'Boolean(window.fixtureReady)', returnByValue: true });
                if (ready.result.value) {
                    const evaluation = await call('Runtime.evaluate', {
                        expression: 'window.fixtureReady.then(run => run())',
                        awaitPromise: true,
                        returnByValue: true
                    });
                    assert.deepEqual(evaluation.result.value, { passed: true });
                    for (const width of [1366, 1100]) {
                        await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
                        const layout = await call('Runtime.evaluate', { expression: 'window.checkLayout()', awaitPromise: true, returnByValue: true });
                        assert.equal(layout.result.value, true);
                    }
                    if (process.env.LAYERS_SCREENSHOT_PATH) {
                        const screenshot = await call('Page.captureScreenshot', { format: 'png' });
                        await writeFile(process.env.LAYERS_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
                    }
                    const finish = await call('Runtime.evaluate', { expression: 'window.finish()', returnByValue: true });
                    assert.equal(finish.result.value, true);
                    return evaluation.result.value;
                }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            throw new Error('Layers panel browser fixture did not finish loading.');
        });
        assert.deepEqual(result, { passed: true });
    } finally {
        await vite.close();
    }
});
