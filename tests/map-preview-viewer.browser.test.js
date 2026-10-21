import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

// Opt in with TEST_PREVIEW_BROWSER=1; override CHROME_PATH on other platforms.
test('enlarged Export and Share previews preserve state and support navigation', {
    skip: !process.env.TEST_PREVIEW_BROWSER,
    timeout: 120000
}, async (t) => {
    const fixture = await readFile(new URL('./map-preview-viewer.browser.html', import.meta.url), 'utf8');
    const vite = await createServer({
        configFile: false,
        server: { host: '127.0.0.1', port: 0 },
        plugins: [{
            name: 'map-preview-viewer-browser-test',
            configureServer(server) {
                server.middlewares.use('/__map_preview_test', (_request, response) => {
                    response.setHeader('Content-Type', 'text/html');
                    response.end(fixture);
                });
            }
        }]
    });
    const profile = await mkdtemp(join(tmpdir(), 'gp-map-preview-test-'));
    let chrome;
    let socket;
    try {
        await vite.listen();
        const { port } = vite.httpServer.address();
        chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
            '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--remote-debugging-port=0', `--user-data-dir=${profile}`,
            'about:blank'
        ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        const endpoint = await new Promise((resolveEndpoint, reject) => {
            let stderr = '';
            chrome.once('error', reject);
            chrome.once('exit', (code) => reject(new Error(`Chrome exited before startup (${code})`)));
            chrome.stderr.on('data', (data) => {
                stderr += data;
                const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
                if (match) resolveEndpoint(match[1]);
            });
        });
        const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
        const page = targets.find(target => target.type === 'page');
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolveOpen, reject) => {
            socket.addEventListener('open', resolveOpen, { once: true });
            socket.addEventListener('error', reject, { once: true });
        });
        let nextId = 0;
        const pending = new Map();
        let resolveLoaded;
        socket.addEventListener('message', (event) => {
            const response = JSON.parse(event.data);
            if (response.method === 'Page.loadEventFired') resolveLoaded?.();
            const request = pending.get(response.id);
            if (!request) return;
            pending.delete(response.id);
            if (response.error || response.result?.exceptionDetails) {
                request.reject(new Error(JSON.stringify(response.error || response.result.exceptionDetails)));
            } else request.resolve(response.result);
        });
        const call = (method, params = {}) => new Promise((resolveCall, reject) => {
            const id = ++nextId;
            pending.set(id, { resolve: resolveCall, reject });
            socket.send(JSON.stringify({ id, method, params }));
        });
        await call('Page.enable');
        const loaded = new Promise(resolvePage => { resolveLoaded = resolvePage; });
        await call('Page.navigate', { url: `http://127.0.0.1:${port}/__map_preview_test` });
        await loaded;
        const evaluation = await call('Runtime.evaluate', {
            expression: 'window.fixtureReady.then(run => run())', awaitPromise: true, returnByValue: true
        });
        const result = evaluation.result.value;
        assert.equal(result.length, 3);
        for (const entry of result) t.diagnostic(JSON.stringify(entry));
        const position = await call('Runtime.evaluate', { expression: 'JSON.stringify(window.panStage.getBoundingClientRect().toJSON())', returnByValue: true });
        const rect = JSON.parse(position.result.value);
        const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - 200, y: y - 100, buttons: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x - 200, y: y - 100, button: 'left', buttons: 0, clickCount: 1 });
        const pan = await call('Runtime.evaluate', { expression: 'window.finishPanTest()', awaitPromise: true, returnByValue: true });
        assert.equal(pan.result.value, true);
        for (const [width, height] of [[1366, 768], [1920, 1080], [2560, 1440], [520, 900], [1200, 500]]) {
            await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 600 });
            const responsive = await call('Runtime.evaluate', { expression: `window.checkResponsiveViewer(${width},${height})`, awaitPromise: true, returnByValue: true });
            assert.equal(responsive.result.value, true, `responsive popup ${width}x${height}`);
        }
        await call('Emulation.clearDeviceMetricsOverride');

    } finally {
        socket?.close();
        if (chrome && chrome.exitCode === null) {
            const exited = new Promise(resolveExit => chrome.once('exit', resolveExit));
            chrome.kill();
            await exited;
        }
        await vite.close();
        // Only remove the specific temporary profile created by this test.
        assert.equal(dirname(resolve(profile)), resolve(tmpdir()));
        await rm(profile, { recursive: true, force: true, maxRetries: 3 });
    }
});
