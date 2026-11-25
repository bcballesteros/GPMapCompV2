import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';
import { browserSession } from './helpers/browser-session.js';

const base = '/GPMapCompV2';
const layers = '[aria-controls="layersSidebar"]';
const tools = '[aria-controls="toolsSidebar"]';
const viewports = [[768, 1024], [1024, 768], [360, 800], [390, 844], [430, 932], [800, 360], [844, 390], [915, 412]];

test('responsive workspace preserves the map and exposes GIS workflows on phones and tablets', {
    skip: !process.env.TEST_MOBILE_BROWSER, timeout: 120000
}, async () => {
    const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
    try {
        await vite.listen();
        await browserSession(async call => {
            const evaluate = async expression => (await call('Runtime.evaluate', {
                expression, awaitPromise: true, returnByValue: true
            })).result.value;
            const waitFor = predicate => evaluate(`(async () => {
                for (let i = 0; i < 400; i++) {
                    const result = (${predicate})();
                    if (result) return result;
                    await new Promise(resolve => setTimeout(resolve, 25));
                }
                throw new Error('Timed out: ' + ${JSON.stringify(predicate)});
            })()`);
            const select = selector => `document.querySelector(${JSON.stringify(selector)})`;
            const click = selector => evaluate(`${select(selector)}.click()`);
            const key = async (pressed, modifiers = 0) => {
                await call('Input.dispatchKeyEvent', { type: pressed === 'Enter' ? 'keyDown' : 'rawKeyDown',
                    key: pressed, code: pressed, modifiers, ...(pressed === 'Enter' && { text: '\r' }),
                    windowsVirtualKeyCode: { Escape: 27, Tab: 9, Enter: 13, Backspace: 8 }[pressed] });
                await call('Input.dispatchKeyEvent', { type: 'keyUp', key: pressed, modifiers });
            };
            const tap = async selector => {
                const point = await waitFor(`() => {
                    const target = ${select(selector)};
                    if (!target) return false;
                    const box = target.getBoundingClientRect();
                    const x = target.matches('.drawer-backdrop') ? box.left + 8 : box.x + box.width / 2;
                    const y = box.y + box.height / 2;
                    return target.contains(document.elementFromPoint(x, y)) && { x, y };
                }`);
                await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
                await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            };
            const scrollTap = async selector => {
                await evaluate(`${select(selector)}.scrollIntoView({ block: 'center' })`);
                await tap(selector);
            };
            const viewport = async (width, height, mobile = true) => {
                await call('Emulation.setTouchEmulationEnabled', { enabled: mobile });
                await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile,
                    screenOrientation: width > height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
                const mapFits = `() => {
                    const target = document.querySelector('#mapContainer');
                    const size = window.map?.getSize();
                    return innerWidth === ${width} && innerHeight === ${height} && size &&
                        Math.abs(size[0] - target.clientWidth) < 2 && Math.abs(size[1] - target.clientHeight) < 2;
                }`;
                try {
                    await waitFor(mapFits);
                } catch (error) {
                    const geometry = await evaluate(`({
                        viewport: [innerWidth, innerHeight, visualViewport.width, visualViewport.height],
                        page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
                        map: map.getSize(), overflowing: [...document.querySelectorAll('body *')].filter(el =>
                            getComputedStyle(el).visibility === 'visible' && el.getBoundingClientRect().right > ${width} + 1)
                            .slice(0, 12).map(el => [el.id || el.className, el.getBoundingClientRect().right])
                    })`);
                    throw new Error(`Viewport ${width}x${height} did not settle: ${JSON.stringify(geometry)}`, { cause: error });
                }
            };
            const screenshot = async name => {
                const dir = process.env.MOBILE_SCREENSHOT_DIR;
                if (!dir) return;
                await mkdir(dir, { recursive: true });
                const { data } = await call('Page.captureScreenshot', { format: 'png' });
                await writeFile(join(dir, `${name}.png`), Buffer.from(data, 'base64'));
            };

            await call('Network.enable');
            await call('Network.setBlockedURLs', { urls: ['*://basemapserver.geoportal.gov.ph/*', '*://*.tile.openstreetmap.org/*', 'http://192.168.*'] });
            await call('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
            await call('Page.navigate', { url: `http://127.0.0.1:${vite.httpServer.address().port}${base}/` });
            await waitFor("() => document.body.classList.contains('app-ready') && window.openModal");
            await evaluate(`(async () => {
                const { getMap } = await import('${base}/src/state/store.js');
                const { addVectorLayer } = await import('${base}/src/map/layer-manager.js');
                const { addLayerItem } = await import('${base}/src/ui/layers-panel.js');
                const { getLayerRecord } = await import('${base}/src/state/store.js');
                const { getSearchState } = await import('${base}/src/ui/location-search.js');
                const { ANNOTATION_LAYER_ID, DRAWING_LAYER_ID } = await import('${base}/src/config/constants.js');
                const { default: ol } = await import('${base}/src/lib/ol.js');
                window.map = getMap();
                window.drawingCount = () => getLayerRecord(DRAWING_LAYER_ID)?.source.getFeatures().length;
                window.searchResult = getSearchState;
                window.annotationText = () => getLayerRecord(ANNOTATION_LAYER_ID)?.source.getFeatures()[0]?.get('text');
                const view = map.getView();
                const [x, y] = view.getCenter();
                const d = view.getResolution() * 56;
                const coordinates = [[[x-d,y-d], [x+d,y-d], [x+d,y+d], [x-d,y+d], [x-d,y-d]]];
                const feature = new ol.Feature({ geometry: new ol.geom.Polygon(coordinates), district: 'Fixture district' });
                for (let i = 1; i <= 8; i++) {
                    const name = 'Planning boundary ' + i;
                    const geojson = { features: [{ geometry: { type: 'Polygon', coordinates } }] };
                    const record = addVectorLayer(name, '#2563eb', geojson, [feature.clone()], { sourceFormat: 'geojson' });
                    addLayerItem(name, record.color, 1);
                    if (i < 8) record.layer.setVisible(false);
                }
                document.querySelector('.app-logo img').src = '${base}/assets/images/gplogo.png';
            })()`);
            const [fixtureCenter, fixtureZoom] = await evaluate('[map.getView().getCenter(), map.getView().getZoom()]');
            await screenshot('desktop-1366x768');
            await click('.sidebar-left .sidebar-layout-handle');
            await click('.right-sidebar-layout-handle');
            await viewport(390, 844);
            assert.equal(await evaluate("document.querySelectorAll('aside[inert]').length"), 2);
            assert.equal(await evaluate(`${select('#layersSidebar .btn-upload')}.focus(), document.activeElement.closest('#layersSidebar')`), null);
            await tap(layers);
            assert.deepEqual(await evaluate(`[
                ${select(layers)}.getAttribute('aria-expanded'), ${select(tools)}.getAttribute('aria-expanded'),
                document.activeElement.getAttribute('aria-label'), ${select('#layersSidebar')}.getAttribute('aria-modal'),
                ${select('.canvas-area')}.inert
            ]`), ['true', 'false', 'Close Layers', 'true', true]);
            await key('Tab', 8);
            assert.equal(await evaluate("document.activeElement.closest('aside')?.id"), 'layersSidebar');
            await key('Tab');
            assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), 'Close Layers');
            await click(tools);
            assert.deepEqual(await evaluate("[...document.querySelectorAll('.is-drawer-open')].map(el => el.id)"), ['toolsSidebar']);
            await key('Escape');
            assert.equal(await evaluate("document.activeElement.getAttribute('aria-controls')"), 'toolsSidebar');
            await tap(layers);
            await tap('.btn-upload');
            await waitFor("() => document.querySelector('#uploadModal.visible')");
            await waitFor("() => document.activeElement.closest('.modal-overlay')?.id === 'uploadModal'");
            assert.equal(await evaluate("document.querySelector('#layersSidebar').inert"), true);
            await tap('#wmsTab');
            assert.equal(await evaluate("document.querySelector('#wmsTab').getAttribute('aria-selected')"), 'true');
            // Simulate the height and offset reported by a mobile browser with a keyboard open.
            await evaluate(`Object.defineProperties(visualViewport, { height: { value: 260, configurable: true },
                offsetTop: { value: 80, configurable: true } }); visualViewport.dispatchEvent(new Event('resize'))`);
            assert.deepEqual(await evaluate(`(() => {
                const modal = document.querySelector('#uploadModal .modal').getBoundingClientRect();
                const body = document.querySelector('#uploadModal .modal-body');
                return [modal.top >= 80, modal.bottom <= 340, body.scrollHeight > body.clientHeight];
            })()`), [true, true, true]);
            await evaluate("delete visualViewport.height; delete visualViewport.offsetTop; visualViewport.dispatchEvent(new Event('resize'))");
            await tap('#geoportalTab');
            assert.equal(await evaluate("document.querySelector('#geoportalTab').getAttribute('aria-selected')"), 'true');
            await tap('#uploadTab');
            await key('Escape');
            await waitFor("() => !document.querySelector('#uploadModal.active')");
            assert.equal(await evaluate("document.activeElement.classList.contains('btn-upload')"), true);
            await tap('#layersSidebar .drawer-close');
            assert.equal(await evaluate("document.activeElement.getAttribute('aria-controls')"), 'layersSidebar');

            for (const [width, height] of viewports) {
                await viewport(width, height);
                const metrics = await evaluate(`(() => {
                    const box = selector => document.querySelector(selector).getBoundingClientRect();
                    const controls = ['.app-brand', '.drawer-triggers', '#locationSearchInput', '.location-search-submit', '#basemapSelect', '.btn-share', '.btn-export'];
                    return { page: document.documentElement.scrollWidth, map: box('#mapContainer').height,
                        navbar: box('.navbar').height, zoom: box('.map-control-stack').bottom, status: box('.map-overlay').top,
                        targets: controls.map(selector => {
                            const target = box(selector);
                            return target.width > 0 && target.left >= 0 && target.right <= innerWidth && target.height >= 40;
                        }) };
                })()`);
                assert.ok(metrics.page <= width && metrics.map > height * 0.7 && metrics.navbar <= (width > 720 ? 56 : 104), JSON.stringify(metrics));
                assert.ok(metrics.zoom < metrics.status && metrics.targets.every(Boolean), JSON.stringify(metrics));
                if (width === 390 || width === 844 || width === 768) await screenshot(`map-${width}x${height}`);
                await tap(tools);
                const drawer = await evaluate(`(() => {
                    const scroller = document.querySelector('.right-sidebar-main');
                    const panel = document.querySelector('#toolsSidebar');
                    scroller.scrollTop = scroller.scrollHeight;
                    const close = panel.querySelector('.drawer-close').getBoundingClientRect();
                    return [scroller.scrollTop, scroller.scrollWidth <= scroller.clientWidth, close.top, close.bottom, panel.offsetHeight];
                })()`);
                assert.ok((height > 700 || drawer[0] > 0) && drawer[1] && drawer[2] >= 0 && drawer[3] <= drawer[4], JSON.stringify(drawer));
                if (width === 844) await screenshot('tools-844x390');
                await tap('.drawer-backdrop');
                assert.equal(await evaluate("!document.querySelector('.is-drawer-open') && document.querySelector('.drawer-backdrop').hidden"), true);
            }

            await viewport(390, 844);
            await tap(layers);
            await evaluate("document.querySelector('.sidebar-main').scrollTop = 0");
            await tap('.layer-item .layer-expand-btn');
            assert.equal(await evaluate(`(() => {
                const rows = [...document.querySelector('.layer-item').querySelectorAll('label')].map(el => el.textContent.trim());
                return rows.includes('Fill Color') && rows.indexOf('Fill Color') < rows.indexOf('Show Stroke');
            })()`), true);
            await tap('.layer-item [data-vector-color="polygonFillColor"]');
            assert.equal(await evaluate("document.querySelector('#layersSidebar .vector-color-popup') !== null"), true);
            await key('Escape');
            assert.equal(await evaluate("document.querySelector('.vector-color-popup') === null"), true);
            assert.equal(await evaluate("document.querySelector('.is-drawer-open').id"), 'layersSidebar');
            await tap('.layer-item .layer-actions-trigger');
            assert.equal(await evaluate("Boolean(document.querySelector('#layersSidebar [data-layer-floating-root] .layer-actions-dropdown'))"), true);
            await key('Escape');
            assert.equal(await evaluate("Boolean(document.querySelector('[data-layer-floating-root] .layer-actions-dropdown'))"), false);
            await tap(layers);
            await screenshot('layers-390x844');
            await scrollTap('.layer-item .layer-action-btn.danger');
            await waitFor("() => document.querySelector('#confirmationModal.visible')");
            const layerCount = await evaluate("document.querySelectorAll('.layer-item').length");
            await key('Escape');
            await waitFor("() => !document.querySelector('#confirmationModal.active')");
            assert.equal(await evaluate("document.querySelectorAll('.layer-item').length"), layerCount);
            assert.equal(await evaluate("document.querySelector('.is-drawer-open').id"), 'layersSidebar');
            const snapshot = () => evaluate(`[map.getView().getCenter(), map.getView().getZoom(),
                map.getView().getRotation(), map.getLayers().getLength()]`);
            await evaluate('map.getView().setRotation(0.15)');
            const beforeRotation = await snapshot();
            await viewport(844, 390);
            await waitFor("() => !document.querySelector('.is-drawer-open')");
            assert.deepEqual(await snapshot(), beforeRotation);
            await tap(tools);
            await viewport(1366, 768, false);
            assert.deepEqual(await evaluate(`[
                document.querySelectorAll('aside.is-collapsed').length, document.querySelectorAll('aside[inert]').length,
                document.querySelector('.drawer-backdrop').hidden,
                sessionStorage.getItem('gpmapcomp.layersSidebarCollapsed'), sessionStorage.getItem('gpmapcomp.toolsSidebarCollapsed')
            ]`), [2, 0, true, 'true', 'true']);

            await viewport(844, 390);
            await evaluate(`(() => {
                const select = document.querySelector('#basemapSelect');
                select.value = 'osm';
                select.dispatchEvent(new Event('change', { bubbles: true }));
                const fetch = window.fetch;
                window.fetch = (url, ...args) => String(url).startsWith('https://nominatim.openstreetmap.org/search')
                    ? Promise.resolve(new Response(JSON.stringify([{ lat: 14.6, lon: 121, display_name: 'Fixture location' }])))
                    : fetch(url, ...args);
                const input = document.querySelector('#locationSearchInput');
                input.value = 'Fixture location';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            })()`);
            assert.equal(await evaluate("map.getLayers().item(0).get('basemapId')"), 'osm');
            await tap('.location-search-submit');
            await waitFor("() => searchResult()?.displayName === 'Fixture location'");
            await waitFor('() => !map.getView().getAnimating()');
            await tap('.location-search-clear');
            await tap(tools);
            await evaluate("document.querySelector('.right-sidebar-main').scrollTop = 0");
            await scrollTap('.layer-information-section .tool-section-header');
            await scrollTap('.layer-information-section [onclick="openAttributeTable()"]');
            await waitFor("() => document.querySelector('#attributesModal.visible')");
            assert.match(await evaluate("document.querySelector('#attributeTableContainer').textContent"), /Fixture district/);
            await tap('#attributesModal .modal-close');
            await waitFor("() => !document.querySelector('#attributesModal.active')");
            await scrollTap('.drawing-tools-section .tool-section-header');
            await scrollTap('[data-draw-mode="point"]');
            await tap('#toolsSidebar .drawer-close');
            await tap('#mapContainer');
            await waitFor('() => drawingCount()');
            await tap(tools);
            await scrollTap('.measurement-section .tool-section-header');
            await scrollTap('#measureDistanceBtn');
            await tap('#toolsSidebar .drawer-close');
            assert.equal(await evaluate("map.getInteractions().getArray().some(i => i.get('gpmapInteractionKind') === 'measurement')"), true);
            await evaluate(`(() => {
                const measuring = map.getInteractions().getArray().find(i => i.get('gpmapInteractionKind') === 'measurement');
                const [x, y] = map.getView().getCenter();
                measuring.appendCoordinates([[x, y], [x + 1000, y + 1000]]);
                measuring.finishDrawing();
            })()`);
            await tap(tools);
            await scrollTap('.annotation-tools-section:not(.drawing-tools-section) .tool-section-header');
            await scrollTap('#addTextAnnotationBtn');
            await tap('#toolsSidebar .drawer-close');
            await tap('#mapContainer');
            await waitFor("() => document.querySelector('#annotationPopup.active')");
            await evaluate("document.querySelector('#annotationInput').value = 'Responsive note'");
            await tap('#annotationPopup .annotation-btn.primary');
            await waitFor("() => annotationText() === 'Responsive note'");
            await tap('#mapContainer');
            await waitFor("() => !document.querySelector('#editAnnotationBtn').disabled");
            await tap(tools);
            await scrollTap('#editAnnotationBtn');
            await waitFor("() => document.activeElement.id === 'editAnnotationText'");
            assert.equal(await evaluate("document.querySelector('.drawer-backdrop').hidden"), true);
            await evaluate("document.querySelector('#editAnnotationText').value = 'Edited responsive note'");
            await tap('#editSaveBtn');
            assert.equal(await evaluate('annotationText()'), 'Edited responsive note');
            await tap(tools);
            await scrollTap('.feature-saving-section .tool-section-header');
            await scrollTap('.feature-saving-section [onclick="openFeatureSaveDialog()"]');
            await waitFor("() => document.querySelector('#featureSaveModal.visible')");
            assert.equal(await evaluate("document.querySelector('#featureSaveItems').textContent.includes('Measurements')"), true);
            await tap('#featureSaveModal .modal-close');
            await waitFor("() => !document.querySelector('#featureSaveModal.active')");
            await tap('#toolsSidebar .drawer-close');

            await evaluate(`map.getLayers().getArray().slice().filter(layer => layer.get('basemapId')).forEach(layer => map.removeLayer(layer))`);
            await evaluate(`map.getView().setCenter(${JSON.stringify(beforeRotation[0])}); map.getView().setZoom(${beforeRotation[1]})`);
            for (const [trigger, id, primary] of [['.btn-export', 'exportModal', '#downloadBtn'], ['.btn-share', 'shareModal', '#sendShareBtn']]) {
                await tap(trigger);
                await waitFor(`() => document.querySelector('#${id} canvas[role="img"]') &&
                    getComputedStyle(document.querySelector('#${id}')).opacity === '1' &&
                    getComputedStyle(document.querySelector('#${id} .export-preview-placeholder')).opacity === '0'`);
                const geometry = await evaluate(`(() => {
                    const box = selector => document.querySelector(selector).getBoundingClientRect();
                    const modal = box('#${id} .modal');
                    return { top: modal.top, bottom: modal.bottom, height: innerHeight,
                        close: box('#${id} .modal-close').top, primary: box('${primary}').bottom };
                })()`);
                if (id === 'exportModal') await screenshot(`${id}-844x390`);
                assert.ok(geometry.top >= 0 && geometry.bottom <= geometry.height && geometry.close >= geometry.top &&
                    geometry.primary <= geometry.bottom + 1, `${id} ${JSON.stringify(geometry)}`);
                await tap(`#${id} .modal-close`);
                await waitFor(`() => !document.querySelector('#${id}.active')`);
                assert.equal(await evaluate(`document.activeElement.closest('.nav-actions') && document.activeElement.className`),
                    id === 'exportModal' ? 'btn btn-export btn-primary' : 'btn btn-share', id);
            }
            const [center, zoom] = await snapshot();
            await call('Input.synthesizeScrollGesture', { x: 320, y: 180, xDistance: 100, yDistance: 0,
                gestureSourceType: 'touch', preventFling: true });
            await waitFor(`() => map.getView().getCenter()[0] !== ${center[0]}`);
            await call('Input.synthesizePinchGesture', { x: 320, y: 180, scaleFactor: 1.7, gestureSourceType: 'touch' });
            await waitFor(`() => map.getView().getZoom() > ${zoom}`);
            await evaluate(`map.getView().setCenter(${JSON.stringify(fixtureCenter)}); map.getView().setZoom(${fixtureZoom})`);

            const shareViewports = [[1920, 1080], [1440, 900], [1366, 768], [768, 1024], [1024, 768], [390, 844], [844, 390], [915, 412]];
            const shareMessage = '#shareCustomMessage';
            const count = () => evaluate("document.getElementById('shareCustomMessageCount').textContent");
            const value = () => evaluate(`${select(shareMessage)}.value`);
            for (const [width, height] of shareViewports) {
                await viewport(width, height, width <= 1024);
                await click('.btn-share');
                await waitFor(`() => document.querySelector('#sharePreviewMap canvas[role="img"]') &&
                    getComputedStyle(document.querySelector('#shareModal')).opacity === '1' &&
                    getComputedStyle(document.querySelector('#sharePreviewPlaceholder')).opacity === '0'`);
                const geometry = await evaluate(`(() => {
                    const find = selector => document.querySelector(selector);
                    const box = selector => find(selector).getBoundingClientRect();
                    const modal = box('.share-modal');
                    const preview = box('#sharePreviewContainer');
                    const body = find('.share-modal-body');
                    const controls = box('.share-controls-grid');
                    const message = box('#shareCustomMessage');
                    const counter = box('#shareCustomMessageCount');
                    const footer = box('#shareModal .modal-footer');
                    return {
                        fits: modal.top >= 0 && modal.bottom <= innerHeight + 1 && modal.left >= 0 && modal.right <= innerWidth,
                        previewRatio: preview.width / preview.height,
                        fullWidth: Math.abs(message.left - controls.left) < 1 && Math.abs(message.right - controls.right) < 1,
                        order: preview.bottom <= controls.top && controls.bottom <= message.top && message.bottom <= counter.top,
                        noOverflow: body.scrollWidth <= body.clientWidth && counter.right <= modal.right &&
                            document.documentElement.scrollWidth <= innerWidth,
                        actions: box('#shareModal .modal-close').top >= modal.top && footer.top >= body.getBoundingClientRect().bottom - 1 &&
                            box('#sendShareBtn').bottom <= modal.bottom && box('#shareModal .modal-footer .btn-secondary').bottom <= modal.bottom,
                        scrolls: body.scrollHeight > body.clientHeight
                    };
                })()`);
                assert.ok(geometry.fits && geometry.fullWidth && geometry.order && geometry.noOverflow && geometry.actions &&
                    Math.abs(geometry.previewRatio - 4 / 3) < 0.01, `${width}x${height} ${JSON.stringify(geometry)}`);
                if (height < 500) assert.ok(geometry.scrolls, `${width}x${height} scrolls`);
                await evaluate(`(() => {
                    const area = document.getElementById('shareCustomMessage');
                    area.value = 'Please review the mapped areas before our assessment.\\nSalamat!';
                    area.dispatchEvent(new Event('input', { bubbles: true }));
                    if (${geometry.scrolls}) document.getElementById('shareCustomMessageCount').scrollIntoView({ block: 'nearest' });
                })()`);
                assert.equal(await evaluate(`(() => {
                    const body = document.querySelector('.share-modal-body').getBoundingClientRect();
                    const area = document.querySelector('#shareCustomMessage').getBoundingClientRect();
                    const count = document.querySelector('#shareCustomMessageCount').getBoundingClientRect();
                    return area.top >= body.top && count.bottom <= body.bottom + 1;
                })()`), true, `Message and counter reachable at ${width}x${height}`);
                await screenshot(`share-${width}x${height}`);
                await click('#shareModal .modal-footer .btn-secondary');
                await waitFor("() => !document.querySelector('#shareModal.active')");
            }
            await viewport(390, 844);
            await click('.btn-share');
            await waitFor("() => document.querySelector('#shareModal.visible')");
            assert.equal(await value(), 'Please review the mapped areas before our assessment.\nSalamat!');
            const insertText = text => call('Input.insertText', { text });
            await evaluate(`${select(shareMessage)}.focus(); ${select(shareMessage)}.select()`);
            await insertText('🌏');
            assert.equal(await count(), '2/500 characters');
            await key('Enter');
            assert.equal(await value(), '🌏\n');
            assert.equal(await count(), '3/500 characters');
            assert.equal(await evaluate("document.querySelectorAll('#recipientChips .recipient-chip').length"), 0);
            assert.equal(await evaluate("document.getElementById('shareFeedback').textContent"), '');
            await key('Backspace');
            assert.equal(await count(), '2/500 characters');
            await evaluate(`${select(shareMessage)}.select()`);
            // CDP inserts the whole string through the browser's native editing path.
            await insertText('x'.repeat(501));
            assert.equal(await value(), 'x'.repeat(500));
            assert.equal(await count(), '500/500 characters');
            await evaluate(`${select(shareMessage)}.select()`);
            await key('Backspace');
            assert.equal(await count(), '0/500 characters');

            await evaluate(`Object.defineProperties(visualViewport, { height: { value: 320, configurable: true },
                offsetTop: { value: 48, configurable: true } }); visualViewport.dispatchEvent(new Event('resize'))`);
            await waitFor(`() => document.querySelector('#shareModal .modal').getBoundingClientRect().bottom <= 368`);
            await evaluate("document.getElementById('shareCustomMessageCount').scrollIntoView({ block: 'nearest' })");
            assert.equal(await evaluate(`(() => {
                const body = document.querySelector('.share-modal-body').getBoundingClientRect();
                const area = document.getElementById('shareCustomMessage').getBoundingClientRect();
                const count = document.getElementById('shareCustomMessageCount').getBoundingClientRect();
                return document.activeElement.id === 'shareCustomMessage' && area.top >= body.top &&
                    count.bottom <= body.bottom + 1 && document.getElementById('sendShareBtn').getBoundingClientRect().bottom <= 368;
            })()`), true, 'Remarks and Send stay reachable in a simulated keyboard viewport');
            await evaluate("delete visualViewport.height; delete visualViewport.offsetTop; visualViewport.dispatchEvent(new Event('resize'))");
            await key('Escape');
            await waitFor("() => !document.querySelector('#shareModal.active')");
        });
    } finally {
        await vite.close();
    }
});
