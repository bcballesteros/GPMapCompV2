import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
                    if (process.env.SVG_MARKER_SCREENSHOT_DIR) {
                        await mkdir(process.env.SVG_MARKER_SCREENSHOT_DIR, { recursive: true });
                        const item = await call('Runtime.evaluate', { expression: `(() => {
                            const item = document.querySelector('.layer-item');
                            if (item.classList.contains('collapsed')) item.querySelector('.layer-expand-btn').click();
                            return true;
                        })()`, returnByValue: true });
                        assert.equal(item.result.value, true);
                        await new Promise(resolve => setTimeout(resolve, 350));
                        for (const [name, width, height, mobile] of [
                            ['point-stroke-enabled-1920x1080', 1920, 1080, false],
                            ['point-stroke-enabled-1366x768', 1366, 768, false],
                            ['point-stroke-enabled-844x390', 844, 390, true],
                            ['point-stroke-enabled-390x844', 390, 844, true]
                        ]) {
                            await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
                            if (mobile) await call('Runtime.evaluate', { expression: "document.querySelector('.sidebar-left').classList.add('is-drawer-open')" });
                            if (width === 844) {
                                const visible = await call('Runtime.evaluate', { expression: `(() => {
                                    const control = document.querySelector('.marker-stroke-width-slider');
                                    control.scrollIntoView({ block: 'center' });
                                    const rect = control.getBoundingClientRect();
                                    return rect.top >= 0 && rect.bottom <= innerHeight;
                                })()`, returnByValue: true });
                                assert.equal(visible.result.value, true, 'point Stroke Width remains reachable in mobile landscape');
                            }
                            const screenshot = await call('Page.captureScreenshot', { format: 'png' });
                            await writeFile(`${process.env.SVG_MARKER_SCREENSHOT_DIR}/${name}.png`, Buffer.from(screenshot.data, 'base64'));
                        }
                        await call('Runtime.evaluate', { expression: "document.querySelector('.marker-stroke-enabled').click()" });
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const disabled = await call('Page.captureScreenshot', { format: 'png' });
                        await writeFile(`${process.env.SVG_MARKER_SCREENSHOT_DIR}/point-stroke-disabled-390x844.png`, Buffer.from(disabled.data, 'base64'));
                        await call('Emulation.clearDeviceMetricsOverride');
                    }
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
