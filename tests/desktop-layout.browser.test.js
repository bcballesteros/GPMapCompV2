import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import { createServer } from 'vite';
import { browserSession } from './helpers/browser-session.js';

test('desktop workspace scales panels and preserves collapse state', { skip: !process.env.TEST_DESKTOP_BROWSER, timeout: 120000 }, async () => {
    const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
    try {
        await vite.listen();
        const { port } = vite.httpServer.address();
        await browserSession(async call => {
            await call('Page.navigate', { url: `http://127.0.0.1:${port}/` });
            const evaluate = async expression => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
            await evaluate(`document.readyState === 'complete' ? true : new Promise(resolve => window.addEventListener('load', resolve, { once: true }))`);
            for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768], [1280, 800], [1100, 700]]) {
                await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
                await evaluate('new Promise(resolve => setTimeout(resolve, 300))');
                const metrics = await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
                    const rect = selector => document.querySelector(selector).getBoundingClientRect();
                    resolve({ left: rect('.sidebar-left').width, right: rect('.sidebar-right').width,
                        map: rect('.canvas-area').width, page: document.documentElement.scrollWidth,
                        mapTarget: rect('#mapContainer').width, controls: rect('.map-control-stack').right,
                        leftBackground: getComputedStyle(document.querySelector('.sidebar-left')).backgroundColor,
                        rightBackground: getComputedStyle(document.querySelector('.sidebar-right')).backgroundColor,
                        handles: ['.sidebar-left .sidebar-layout-handle', '.right-sidebar-layout-handle'].map(selector => {
                            const handle = document.querySelector(selector), box = handle.getBoundingClientRect();
                            return handle.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
                        }) });
                })))`);
                assert.ok(metrics.left >= 256 && metrics.left <= 289, JSON.stringify(metrics));
                assert.ok(metrics.right >= 264 && metrics.right <= 301, JSON.stringify(metrics));
                assert.ok(metrics.map >= width - 590 && metrics.mapTarget > 0, JSON.stringify(metrics));
                assert.ok(metrics.page <= width && metrics.controls <= width - metrics.right, JSON.stringify(metrics));
                assert.equal(metrics.leftBackground, metrics.rightBackground);
                assert.deepEqual(metrics.handles, [true, true], JSON.stringify(metrics));
                if (process.env.DESKTOP_SCREENSHOT_PATH && width === 1366) {
                    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
                    await writeFile(process.env.DESKTOP_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
                }
            }
            const collapse = await evaluate(`(async () => {
                const left = document.querySelector('.sidebar-left .sidebar-layout-handle');
                const right = document.querySelector('.right-sidebar-layout-handle');
                const map = document.querySelector('.canvas-area');
                const olMap = (await import('/GPMapCompV2/src/state/store.js')).getMap();
                const before = map.getBoundingClientRect().width;
                left.click(); right.click();
                await new Promise(resolve => setTimeout(resolve, 350));
                const result = { before, after: map.getBoundingClientRect().width, left: left.getAttribute('aria-expanded'),
                    right: right.getAttribute('aria-expanded'), savedLeft: sessionStorage.getItem('gpmapcomp.layersSidebarCollapsed'),
                    savedRight: sessionStorage.getItem('gpmapcomp.toolsSidebarCollapsed'), mapSize: olMap.getSize()[0] };
                left.click(); right.click();
                await new Promise(resolve => setTimeout(resolve, 350));
                result.restored = map.getBoundingClientRect().width;
                result.restoredMapSize = olMap.getSize()[0];
                return result;
            })()`);
            assert.ok(collapse.after > collapse.before + 500, JSON.stringify(collapse));
            assert.ok(Math.abs(collapse.after - collapse.mapSize) < 2, JSON.stringify(collapse));
            assert.deepEqual([collapse.left, collapse.right, collapse.savedLeft, collapse.savedRight], ['false', 'false', 'true', 'true']);
            assert.ok(Math.abs(collapse.restored - collapse.before) < 1);
            assert.ok(Math.abs(collapse.restored - collapse.restoredMapSize) < 2, JSON.stringify(collapse));
        });
    } finally {
        await vite.close();
    }
});
