import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
            const viewports = [[1920, 1080], [1440, 900], [1367, 768], [1366, 768], [1280, 800],
                [1161, 700], [1160, 700], [1100, 700], [1100, 481], [1025, 700], [1024, 768]];
            for (const [width, height] of viewports) {
                await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
                await evaluate('new Promise(resolve => setTimeout(resolve, 300))');
                const metrics = await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
                    const rect = selector => document.querySelector(selector).getBoundingClientRect();
                    const nav = document.querySelector('.navbar'), style = getComputedStyle(nav);
                    const tracks = style.gridTemplateColumns.split(' ').map(parseFloat);
                    const gap = parseFloat(style.columnGap), padding = parseFloat(style.paddingLeft);
                    const rightTrack = { left: nav.getBoundingClientRect().left + padding + tracks[0] + gap + tracks[1] + gap,
                        right: nav.getBoundingClientRect().right - parseFloat(style.paddingRight) };
                    const boxes = ['.navbar-left', '.navbar-center', '.navbar-right', '.location-search-label',
                        '.basemap-selector', '.basemap-selector label', '#locationSearchInput', '.location-search-clear',
                        '.location-search-submit', '#basemapSelect', '.btn-share', '.btn-export'];
                    const boxData = Object.fromEntries(boxes.map(selector => {
                        const element = document.querySelector(selector), box = element.getBoundingClientRect();
                        return [selector, { left: box.left, right: box.right, width: box.width,
                            visible: getComputedStyle(element).display !== 'none' && box.width > 0 }];
                    }));
                    const overlap = (a, b) => a.left < b.right - .5 && b.left < a.right - .5;
                    resolve({ left: rect('.sidebar-left').width, right: rect('.sidebar-right').width,
                        map: rect('.canvas-area').width, page: document.documentElement.scrollWidth,
                        navbarWidth: nav.getBoundingClientRect().width, tracks, rightTrack, boxData,
                        searchWidth: rect('.location-search').width,
                        basemapInternalSpace: rect('.basemap-selector').width - rect('.basemap-selector label').width - rect('#basemapSelect').width,
                        searchToBasemapLabelGap: rect('.basemap-selector label').left - rect('.location-search').right,
                        rightTrackWidth: rightTrack.right - rightTrack.left,
                        rightTrackOverflow: rect('.navbar-right').right - rightTrack.right,
                        rightGroupFitsTrack: rect('.navbar-right').left >= rightTrack.left - .5 && rect('.navbar-right').right <= rightTrack.right + .5,
                        groupsOverlap: overlap(rect('.navbar-center'), rect('.navbar-right')),
                        labelOverlap: overlap(rect('.location-search-label'), rect('.basemap-selector label')),
                        fonts: { app: getComputedStyle(document.querySelector('.app-title')).fontSize,
                            labels: getComputedStyle(document.querySelector('.location-search-label')).fontSize,
                            input: getComputedStyle(document.querySelector('#locationSearchInput')).fontSize,
                            basemap: getComputedStyle(document.querySelector('#basemapSelect')).fontSize,
                            actions: getComputedStyle(document.querySelector('.btn-share')).fontSize,
                            family: getComputedStyle(document.body).fontFamily,
                            interLoaded: document.fonts.check('13px Inter') },
                        mapTarget: rect('#mapContainer').width, controls: rect('.map-control-stack').right,
                        leftBackground: getComputedStyle(document.querySelector('.sidebar-left')).backgroundColor,
                        rightBackground: getComputedStyle(document.querySelector('.sidebar-right')).backgroundColor,
                        handles: ['.sidebar-left .sidebar-layout-handle', '.right-sidebar-layout-handle'].map(selector => {
                            const handle = document.querySelector(selector), box = handle.getBoundingClientRect();
                            return handle.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
                        }) });
                })))`);
                if (width > 1024) {
                    assert.ok(metrics.left >= 256 && metrics.left <= 289, JSON.stringify(metrics));
                    assert.ok(metrics.right >= 264 && metrics.right <= 301, JSON.stringify(metrics));
                    assert.ok(metrics.map >= width - 590 && metrics.mapTarget > 0, JSON.stringify(metrics));
                    assert.ok(metrics.controls <= width - metrics.right, JSON.stringify(metrics));
                    assert.ok(metrics.rightGroupFitsTrack && !metrics.groupsOverlap && !metrics.labelOverlap &&
                        metrics.searchToBasemapLabelGap >= 0, JSON.stringify(metrics));
                    assert.ok(metrics.boxData['.location-search-submit'].visible && metrics.boxData['#basemapSelect'].visible &&
                        metrics.boxData['.btn-share'].visible && metrics.boxData['.btn-export'].visible, JSON.stringify(metrics));
                    assert.ok(metrics.basemapInternalSpace >= 21 && metrics.basemapInternalSpace <= 25,
                        JSON.stringify({ basemapInternalSpace: metrics.basemapInternalSpace, boxes: metrics.boxData }));
                    assert.ok(metrics.boxData['.navbar-right'].right <= metrics.rightTrack.right + .5, JSON.stringify(metrics));
                    assert.match(metrics.fonts.family, /Inter/);
                    assert.equal(metrics.fonts.interLoaded, true);
                    assert.deepEqual([metrics.fonts.app, metrics.fonts.labels, metrics.fonts.input,
                        metrics.fonts.basemap, metrics.fonts.actions], ['16px', '12px', '14px', '14px', '13px']);
                    if ([1920, 1440, 1366, 1280, 1100].includes(width)) {
                        console.log(`Navbar ${width}x${height}: ${JSON.stringify({
                            trackWidth: +metrics.rightTrackWidth.toFixed(2), groupOverflow: +metrics.rightTrackOverflow.toFixed(2),
                            searchWidth: +metrics.searchWidth.toFixed(2), searchToBasemapLabelGap: +metrics.searchToBasemapLabelGap.toFixed(2),
                            basemapWidth: +metrics.boxData['#basemapSelect'].width.toFixed(2), pageWidth: metrics.page
                        })}`);
                    }
                    if ([1920, 1440, 1366, 1280, 1100].includes(width) && process.env.NAVBAR_SCREENSHOT_DIR) {
                        await mkdir(process.env.NAVBAR_SCREENSHOT_DIR, { recursive: true });
                        const screenshot = await call('Page.captureScreenshot', { format: 'png' });
                        await writeFile(join(process.env.NAVBAR_SCREENSHOT_DIR, `navbar-${width}x${height}.png`),
                            Buffer.from(screenshot.data, 'base64'));
                    }
                }
                assert.ok(metrics.page <= width && metrics.mapTarget > 0, JSON.stringify(metrics));
                if (width > 1024) {
                    assert.equal(metrics.leftBackground, metrics.rightBackground);
                    assert.deepEqual(metrics.handles, [true, true], JSON.stringify(metrics));
                }
                if (process.env.DESKTOP_SCREENSHOT_PATH && width === 1366) {
                    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
                    await writeFile(process.env.DESKTOP_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
                }
            }
            for (const [width, height] of [[1100, 700], [1280, 800], [1366, 768]]) {
                await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
                await evaluate(`(() => {
                    const select = document.querySelector('#basemapSelect');
                    window.navbarClearStates = [];
                    for (const index of [0, 1, 3]) {
                        select.selectedIndex = index;
                        const search = document.querySelector('#locationSearchInput');
                        search.value = index ? 'Manila, Philippines' : '';
                        search.dispatchEvent(new Event('input', { bubbles: true }));
                        window.navbarClearStates.push(!document.querySelector('#locationSearchClear').hidden);
                    }
                    return true;
                })()`);
                const state = await evaluate(`(() => {
                    const rect = selector => document.querySelector(selector).getBoundingClientRect();
                    const intersects = (a, b) => a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom && b.top < a.bottom;
                    return { select: rect('#basemapSelect').width, selected: document.querySelector('#basemapSelect').selectedOptions[0].textContent,
                        clearVisible: !document.querySelector('#locationSearchClear').hidden,
                        clearSearchCollision: intersects(rect('#locationSearchClear'), rect('#basemapSelect')),
                        clearStates: window.navbarClearStates,
                        submitName: document.querySelector('.location-search-submit').getAttribute('aria-label'),
                        page: document.documentElement.scrollWidth };
                })()`);
                assert.ok(state.select >= 100 && state.page <= width && state.clearVisible && !state.clearSearchCollision &&
                    state.selected.length > 20 && state.submitName === 'Search location', JSON.stringify(state));
                assert.deepEqual(state.clearStates, [false, true, true], JSON.stringify(state));
                if (width === 1280 && process.env.NAVBAR_SCREENSHOT_DIR) {
                    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
                    await writeFile(join(process.env.NAVBAR_SCREENSHOT_DIR, 'navbar-1280x800-long-basemap-search.png'),
                        Buffer.from(screenshot.data, 'base64'));
                }
            }
            await call('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
            await evaluate('new Promise(resolve => setTimeout(resolve, 300))');
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
