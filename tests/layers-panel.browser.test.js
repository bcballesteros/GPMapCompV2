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
                    const reorder = await call('Runtime.evaluate', { expression: 'window.reorderChecks()', awaitPromise: true, returnByValue: true });
                    assert.equal(reorder.result.value, true);
                    const coordinates = await call('Runtime.evaluate', { expression: 'window.prepareNativeDrag()', awaitPromise: true, returnByValue: true });
                    const { x, y, targetX, targetY } = coordinates.result.value;
                    await call('Input.setInterceptDrags', { enabled: true });
                    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
                    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
                    for (let step = 1; step <= 8; step++) {
                        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + (targetX - x) * step / 8, y: y + (targetY - y) * step / 8, button: 'left', buttons: 1 });
                    }
                    const data = { items: [{ mimeType: 'text/plain', data: 'Map layer' }], dragOperationsMask: 16 };
                    for (const type of ['dragEnter', 'dragOver']) await call('Input.dispatchDragEvent', { type, x: targetX, y: targetY, data });
                    const active = await call('Runtime.evaluate', { expression: `window.inspectActiveDrag(${targetX}, ${targetY})`, awaitPromise: true, returnByValue: true });
                    assert.equal(active.result.value, true);
                    if (process.env.LAYERS_SCREENSHOT_PATH) {
                        const activeScreenshot = await call('Page.captureScreenshot', { format: 'png' });
                        await writeFile(process.env.LAYERS_SCREENSHOT_PATH + '.active.png', Buffer.from(activeScreenshot.data, 'base64'));
                    }
                    const destination = await call('Runtime.evaluate', { expression: 'window.nativeDropPoint()', awaitPromise: true, returnByValue: true });
                    const { x: dropX, y: dropY } = destination.result.value;
                    await call('Input.dispatchDragEvent', { type: 'dragOver', x: dropX, y: dropY, data });
                    await call('Input.dispatchDragEvent', { type: 'drop', x: dropX, y: dropY, data });
                    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dropX, y: dropY, button: 'left', clickCount: 1 });
                    await call('Input.setInterceptDrags', { enabled: false });
                    const native = await call('Runtime.evaluate', { expression: 'window.finishNativeDrag()', returnByValue: true });
                    assert.equal(native.result.value, true);
                    for (const width of [1366, 1100]) {
                        await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
                        const layout = await call('Runtime.evaluate', { expression: 'window.checkLayout()', awaitPromise: true, returnByValue: true });
                        assert.equal(layout.result.value, true);
                    }
                    const named = await call('Runtime.evaluate', { expression: 'window.prepareNamedDrag()', awaitPromise: true, returnByValue: true });
                    const point = named.result.value;
                    await call('Input.setInterceptDrags', { enabled: true });
                    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
                    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
                    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y - 12, button: 'left', buttons: 1 });
                    for (const type of ['dragEnter', 'dragOver']) await call('Input.dispatchDragEvent', { type, x: point.targetX, y: point.targetY, data });
                    const namedActive = await call('Runtime.evaluate', { expression: `window.inspectActiveDrag(${point.targetX}, ${point.targetY})`, awaitPromise: true, returnByValue: true });
                    assert.equal(namedActive.result.value, true);
                    if (process.env.LAYERS_SCREENSHOT_PATH) {
                        const screenshot = await call('Page.captureScreenshot', { format: 'png' });
                        await writeFile(process.env.LAYERS_SCREENSHOT_PATH + '.named-active.png', Buffer.from(screenshot.data, 'base64'));
                    }
                    // Move the same held card below Abra, then outside the sidebar.
                    for (const [moveX, moveY] of [[point.targetX, point.y + 100], [700, 500]]) {
                        await call('Input.dispatchDragEvent', { type: 'dragOver', x: moveX, y: moveY, data });
                        if (moveX === point.targetX) {
                            const moving = await call('Runtime.evaluate', { expression: `window.inspectActiveDrag(${moveX}, ${moveY})`, awaitPromise: true, returnByValue: true });
                            assert.equal(moving.result.value, true);
                        } else {
                            const outside = await call('Runtime.evaluate', { expression: 'document.querySelector(".layer-drag-preview").getBoundingClientRect().right > 500', returnByValue: true });
                            assert.equal(outside.result.value, true);
                        }
                    }
                    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
                    await call('Input.dispatchDragEvent', { type: 'dragCancel', x: 700, y: 500, data });
                    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 500, button: 'left' });
                    await call('Input.setInterceptDrags', { enabled: false });
                    const canceled = await call('Runtime.evaluate', { expression: 'window.finishNamedCancel()', returnByValue: true });
                    assert.equal(canceled.result.value, true);
                    if (process.env.LAYERS_SCREENSHOT_PATH) {
                        const screenshot = await call('Page.captureScreenshot', { format: 'png' });
                        await writeFile(process.env.LAYERS_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
                        await call('Runtime.evaluate', { expression: 'window.showDropFeedback()', awaitPromise: true });
                        const feedback = await call('Page.captureScreenshot', { format: 'png' });
                        await writeFile(process.env.LAYERS_SCREENSHOT_PATH + '.drop.png', Buffer.from(feedback.data, 'base64'));
                        await call('Runtime.evaluate', { expression: 'window.clearDropFeedback()' });
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
