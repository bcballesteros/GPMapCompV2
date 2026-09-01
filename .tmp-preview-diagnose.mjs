const APP_URL = 'http://127.0.0.1:5173/GPMapCompV2/';
const DEBUG_PORT = 9333;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForUrl(url, timeoutMs = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return;
            }
        } catch {
            // Keep polling until Vite is ready.
        }
        await delay(250);
    }
    throw new Error(`Timed out waiting for ${url}`);
}

async function connectToBrowser() {
    await waitForUrl(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const target = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, {
        method: 'PUT'
    }).then((response) => response.json());
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    let id = 0;

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        }
    };

    await new Promise((resolve) => {
        ws.onopen = resolve;
    });

    const send = (method, params = {}) => new Promise((resolve) => {
        const message = { id: ++id, method, params };
        pending.set(message.id, resolve);
        ws.send(JSON.stringify(message));
    });

    const evaluate = async (expression) => {
        const response = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true
        });
        if (response.result.exceptionDetails) {
            throw new Error(response.result.exceptionDetails.text);
        }
        return response.result.result?.value;
    };

    return { ws, send, evaluate };
}

function summarizeEvents(events) {
    return events.map((event) => ({
        sequence: event.sequence,
        time: event.time,
        event: event.event,
        token: event.previewRenderToken,
        scheduled: event.previewSyncScheduled,
        reason: event.reason || null,
        role: event.role || null,
        sync: event.sync ?? null,
        pendingLoads: event.pendingLoads ?? null,
        renderedFrame: event.renderedFrame ?? null,
        ready: event.ready,
        placeholderHidden: event.placeholderHidden,
        mainSize: event.mainSize,
        mainTargetRect: event.mainTargetRect,
        previewTargetRect: event.previewTargetRect,
        previewSize: event.previewSize,
        mainLayerCount: event.mainLayers?.length ?? 0,
        previewLayerCount: event.previewLayers?.length ?? 0,
        activeBasemap: event.activeBasemap,
        previewCanvases: event.previewCanvases,
        sourceState: event.sourceState || null,
        sourceType: event.sourceType || null,
        eventName: event.eventName || null
    }));
}

async function collectStatus(evaluate) {
    return evaluate(`
        (() => {
            const container = document.getElementById('mapPreviewContainer');
            const target = document.getElementById('mapPreviewMap');
            const placeholder = document.getElementById('mapPreviewPlaceholder');
            const rect = target.getBoundingClientRect();
            const canvases = [...target.querySelectorAll('canvas')].map((canvas) => {
                let samples = null;
                let sampleError = null;
                try {
                    const context = canvas.getContext('2d');
                    const points = [
                        [Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)],
                        [Math.floor(canvas.width / 4), Math.floor(canvas.height / 4)],
                        [Math.floor(canvas.width * 0.75), Math.floor(canvas.height * 0.75)]
                    ];
                    samples = points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
                } catch (error) {
                    sampleError = error.message;
                }
                return {
                    width: canvas.width,
                    height: canvas.height,
                    samples,
                    sampleError
                };
            });
            return {
                ready: container.classList.contains('ready'),
                placeholderHidden: placeholder.getAttribute('aria-hidden'),
                placeholderOpacity: getComputedStyle(placeholder).opacity,
                rect: { width: rect.width, height: rect.height },
                canvases,
                debugEvents: window.__GP_PREVIEW_DEBUG__ || []
            };
        })()
    `);
}

async function waitForAppReady(evaluate) {
    await evaluate(`
        new Promise((resolve) => {
            if (document.body.classList.contains('app-ready')) {
                resolve(true);
                return;
            }
            const observer = new MutationObserver(() => {
                if (document.body.classList.contains('app-ready')) {
                    observer.disconnect();
                    resolve(true);
                }
            });
            observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        })
    `);
}

async function waitForPreviewAttempt(evaluate) {
    await evaluate(`
        new Promise((resolve) => {
            const done = () => {
                const events = window.__GP_PREVIEW_DEBUG__ || [];
                return events.some((event) => event.event === 'renderMapPreview:ready-applied'
                    || event.event === 'renderMapPreview:exit-before-ready');
            };
            if (done()) {
                resolve(true);
                return;
            }
            const started = performance.now();
            const tick = () => {
                if (done() || performance.now() - started > 12000) {
                    resolve(done());
                    return;
                }
                requestAnimationFrame(tick);
            };
            tick();
        })
    `);
}

async function main() {
    try {
        await waitForUrl(APP_URL);
        const { ws, send, evaluate } = await connectToBrowser();

        await send('Runtime.enable');
        await send('Page.enable');
        await send('Network.enable');
        await send('Network.setCacheDisabled', { cacheDisabled: true });
        await send('Page.addScriptToEvaluateOnNewDocument', {
            source: 'window.__GP_PREVIEW_DEBUG__ = [];'
        });
        await send('Page.navigate', { url: APP_URL });
        await waitForAppReady(evaluate);
        await delay(250);

        await evaluate(`document.querySelector('.btn-export').click()`);
        await waitForPreviewAttempt(evaluate);
        const first = await collectStatus(evaluate);

        await evaluate(`
            window.__GP_PREVIEW_FIRST_COUNT__ = (window.__GP_PREVIEW_DEBUG__ || []).length;
            closeModal('exportModal');
        `);
        await delay(350);
        await evaluate(`document.getElementById('zoomIn').click()`);
        await delay(1500);
        await evaluate(`document.querySelector('.btn-export').click()`);
        await waitForPreviewAttempt(evaluate);
        const second = await collectStatus(evaluate);
        const firstCount = await evaluate(`window.__GP_PREVIEW_FIRST_COUNT__ || 0`);

        console.log(JSON.stringify({
            first: {
                status: {
                    ready: first.ready,
                    placeholderHidden: first.placeholderHidden,
                    placeholderOpacity: first.placeholderOpacity,
                    rect: first.rect,
                    canvases: first.canvases
                },
                events: summarizeEvents(first.debugEvents)
            },
            second: {
                status: {
                    ready: second.ready,
                    placeholderHidden: second.placeholderHidden,
                    placeholderOpacity: second.placeholderOpacity,
                    rect: second.rect,
                    canvases: second.canvases
                },
                events: summarizeEvents(second.debugEvents.slice(firstCount))
            }
        }, null, 2));

        ws.close();
    } catch (error) {
        throw error;
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
