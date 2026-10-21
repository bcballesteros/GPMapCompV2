import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export async function browserSession(run) {
    const profile = await mkdtemp(join(tmpdir(), 'gp-gpkg-browser-'));
    let chrome;
    let socket;
    try {
        chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
            '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
        ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        const endpoint = await new Promise((resolveEndpoint, reject) => {
            let stderr = '';
            chrome.once('error', reject);
            chrome.once('exit', code => reject(new Error(`Chrome exited (${code})`)));
            chrome.stderr.on('data', data => {
                stderr += data;
                const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
                if (match) resolveEndpoint(match[1]);
            });
        });
        const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json();
        socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
        await new Promise((resolveOpen, reject) => {
            socket.addEventListener('open', resolveOpen, { once: true });
            socket.addEventListener('error', reject, { once: true });
        });
        let nextId = 0;
        const pending = new Map();
        socket.addEventListener('message', event => {
            const response = JSON.parse(event.data);
            const request = pending.get(response.id);
            if (!request) return;
            pending.delete(response.id);
            if (response.error || response.result?.exceptionDetails) request.reject(new Error(JSON.stringify(response.error || response.result.exceptionDetails)));
            else request.resolve(response.result);
        });
        const call = (method, params = {}) => new Promise((resolveCall, reject) => {
            const id = ++nextId;
            pending.set(id, { resolve: resolveCall, reject });
            socket.send(JSON.stringify({ id, method, params }));
        });
        await call('Page.enable');
        return await run(call);
    } finally {
        socket?.close();
        if (chrome && chrome.exitCode === null) {
            const exited = new Promise(resolveExit => chrome.once('exit', resolveExit));
            chrome.kill();
            await exited;
        }
        assert.equal(dirname(resolve(profile)), resolve(tmpdir()));
        await rm(profile, { recursive: true, force: true, maxRetries: 3 });
    }
}
