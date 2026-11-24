import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { browserSession } from './helpers/browser-session.js';

const browserOptions = { skip: !process.env.TEST_SMART_HELP_BROWSER, timeout: 120000 };
const base = '/GPMapCompV2';
const tools = '[aria-controls="toolsSidebar"]';

async function withWorkspace(run) {
    const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
    try {
        await vite.listen();
        await browserSession(async call => {
            const evaluate = async expression => (await call('Runtime.evaluate', {
                expression, awaitPromise: true, returnByValue: true
            })).result.value;
            const waitFor = predicate => evaluate(`(async () => {
                for (let i = 0; i < 400; i++) {
                    if ((${predicate})()) return;
                    await new Promise(resolve => setTimeout(resolve, 25));
                }
                throw new Error('Timed out: ' + ${JSON.stringify(predicate)} + ' | Smart Help: ' +
                    document.querySelector('#smartHelpPrimary')?.textContent);
            })()`);
            const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
            const guidance = () => evaluate("document.querySelector('#smartHelpPrimary').textContent");
            const expectHelp = async pattern => {
                await waitFor(`() => ${pattern}.test(document.querySelector('#smartHelpPrimary').textContent)`);
                assert.match(await guidance(), pattern);
            };
            const viewport = async (width, height, mobile = false) => {
                await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile,
                    screenOrientation: width > height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
                await waitFor(`() => innerWidth === ${width} && innerHeight === ${height} &&
                    map.getSize()?.[0] === document.getElementById('mapContainer').clientWidth &&
                    map.getSize()?.[1] === document.getElementById('mapContainer').clientHeight`);
                await evaluate('map.renderSync()');
            };
            const mapClick = async (dx, dy, fixture = false) => {
                const point = `(() => {
                    const rect = map.getViewport().getBoundingClientRect();
                    const pixel = ${fixture} ? map.getPixelFromCoordinate(fixtureCoordinates['${dx},${dy}']) :
                        [rect.width / 2 + ${dx}, rect.height / 2 + ${dy}];
                    return { x: Math.round(rect.left + pixel[0]), y: Math.round(rect.top + pixel[1]) };
                })()`;
                await waitFor(`() => {
                    const { x, y } = ${point};
                    return map.getViewport().contains(document.elementFromPoint(x, y));
                }`);
                const { x, y } = await evaluate(point);
                await evaluate("window.singleClickSeen = false; void map.once('singleclick', () => { window.singleClickSeen = true; });");
                await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
                await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
                await waitFor('() => singleClickSeen');
            };
            const escape = async () => {
                await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
                await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
            };
            const screenshot = async name => {
                const dir = process.env.SMART_HELP_SCREENSHOT_DIR;
                if (!dir) return;
                await mkdir(dir, { recursive: true });
                const { data } = await call('Page.captureScreenshot', { format: 'png' });
                await writeFile(join(dir, name + '.png'), Buffer.from(data, 'base64'));
            };

            await call('Network.enable');
            await call('Network.setBlockedURLs', { urls: ['*://basemapserver.geoportal.gov.ph/*', '*://*.tile.openstreetmap.org/*', 'http://192.168.*'] });
            await call('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
            await call('Page.navigate', { url: `http://127.0.0.1:${vite.httpServer.address().port}${base}/` });
            await waitFor("() => document.body.classList.contains('app-ready')");
            await evaluate(`(async () => {
                const { getMap } = await import('${base}/src/state/store.js');
                const { addVectorLayer, addWmsLayer } = await import('${base}/src/map/layer-manager.js');
                const { addLayerItem, removeLayerItem } = await import('${base}/src/ui/layers-panel.js');
                const { restoreFeatureSavingCollections } = await import('${base}/src/tools/annotation-tool.js');
                const { default: ol } = await import('${base}/src/lib/ol.js');
                window.map = getMap();
                window.removeLayerItem = removeLayerItem;
                map.getLayers().getArray().slice().filter(layer => layer.get('basemapId')).forEach(layer => map.removeLayer(layer));
                window.coordinate = (x, y) => {
                    const size = map.getSize();
                    return map.getCoordinateFromPixel([size[0] / 2 + x, size[1] / 2 + y]);
                };
                window.addFixtures = () => {
                    const origin = coordinate(-120, 70);
                    const end = coordinate(-90, 100);
                    const polygon = [[origin, [end[0], origin[1]], end, [origin[0], end[1]], origin]];
                    for (const [name, type, coordinates] of [
                        ['Polygon A', 'Polygon', polygon], ['Line B', 'LineString', [origin, end]], ['Point C', 'Point', origin]
                    ]) {
                        const geometry = new ol.geom[type](coordinates);
                        const feature = new ol.Feature({ geometry, district: name });
                        const record = addVectorLayer(name, '#2563eb', { features: [{ geometry: { type, coordinates } }] }, [feature]);
                        addLayerItem(name, record.color, 1);
                    }
                    for (const [name, isGP] of [['WMS D', false], ['Geoportal E', true]]) {
                        const source = new ol.source.TileWMS();
                        const layer = new ol.layer.Tile({ source });
                        const record = addWmsLayer(name, source, layer, { isGP });
                        addLayerItem(name, record.color, 0);
                    }
                };
                window.restoreFixtures = () => {
                    window.fixtureCoordinates = Object.fromEntries([[-75,-50], [-40,50], [15,-65], [60,44], [55,-110], [120,-40], [-125,25]]
                        .map(([x,y]) => [[x,y].join(','), coordinate(x,y)]));
                    restoreFeatureSavingCollections({
                        annotations: [new ol.Feature({
                            geometry: new ol.geom.Point(coordinate(-75, -50)), isAnnotation: true,
                            text: 'Field note', fontSize: 14, fontColor: '#202020', annotationPointVisible: true
                        })],
                        drawings: [
                            new ol.Feature({ geometry: new ol.geom.Point(coordinate(-40, 50)), drawingType: 'point' }),
                            new ol.Feature({ geometry: new ol.geom.LineString([coordinate(35, -110), coordinate(75, -110)]), drawingType: 'line' }),
                            new ol.Feature({ geometry: new ol.geom.Polygon([[
                                coordinate(104, -55), coordinate(138, -55), coordinate(120, -20), coordinate(104, -55)
                            ]]), drawingType: 'polygon' }),
                            new ol.Feature({ geometry: new ol.geom.LineString([
                                coordinate(-150, 35), coordinate(-125, 25), coordinate(-100, 35)
                            ]), drawingType: 'freehand' })
                        ],
                        measurements: [
                            new ol.Feature({ geometry: new ol.geom.LineString([coordinate(-20, -65), coordinate(60, -65)]), measurementType: 'distance' }),
                            new ol.Feature({ geometry: new ol.geom.Polygon([[
                                coordinate(35, 30), coordinate(85, 30), coordinate(60, 75), coordinate(35, 30)
                            ]]), measurementType: 'area' })
                        ]
                    });
                    map.renderSync();
                };
                window.finishSketch = (kind, pixels) => {
                    const draw = map.getInteractions().getArray().find(interaction => interaction.get('gpmapInteractionKind') === kind);
                    draw.appendCoordinates(pixels.map(([x, y]) => coordinate(x, y)));
                    draw.finishDrawing();
                    map.renderSync();
                };
            })()`);
            await run({ evaluate, click, waitFor, expectHelp, viewport, mapClick, escape, screenshot, call });
        });
    } finally {
        await vite.close();
    }
}

const header = name => `[data-layer-name="${name}"] .layer-item-header`;
const control = (name, selector) => `[data-layer-name="${name}"] ${selector}`;
const section = name => `[data-help-section="${name}"] .tool-section-header`;

test('Smart Help follows real layer, map tool, selection, and dialog transitions', browserOptions, async () => {
    await withWorkspace(async ({ evaluate, click, waitFor, expectHelp, mapClick, escape }) => {
        await evaluate(`(() => {
            window.smartHelpPlacementViolations = [];
            new MutationObserver(() => {
                const panel = document.getElementById('smartHelpPanel');
                const sidebar = document.getElementById('toolsSidebar');
                if (document.querySelectorAll('#smartHelpPanel').length !== 1 || !sidebar?.contains(panel) ||
                    panel?.closest('.modal-overlay')) window.smartHelpPlacementViolations.push('Smart Help left the sidebar');
            }).observe(document.documentElement, { childList: true, subtree: true });
        })()`);
        await expectHelp(/Upload a layer|Start with a dataset/);
        await evaluate('addFixtures(); restoreFixtures()');
        await click(section('drawing'));
        await expectHelp(/Drawing Tools/);

        for (const [name, pattern] of [
            ['Polygon A', /Polygon layer selected.*Polygon A/], ['Line B', /Line layer selected.*Line B/],
            ['Point C', /Point layer selected.*Point C/], ['WMS D', /^WMS layer selected/],
            ['Geoportal E', /^Geoportal layer selected/]
        ]) {
            await click(header(name));
            await expectHelp(pattern);
        }
        assert.doesNotMatch(await evaluate("document.querySelector('#smartHelpSecondary').textContent"), /attribute|vector styling/i);
        await click(header('Polygon A'));
        await expectHelp(/Polygon layer selected.*Polygon A/);
        await click(control('Polygon A', '.layer-expand-btn'));
        await click(control('Polygon A', '[data-vector-color="polygonFillColor"]'));
        await expectHelp(/Polygon fill color/);
        await escape();
        await click(control('Polygon A', '.layer-expand-btn'));
        await expectHelp(/Layer controls collapsed/);
        await click(header('Line B'));
        await expectHelp(/Line layer selected/);
        await click(control('Line B', '.layer-expand-btn'));
        const updates = await evaluate(`(async () => {
            const slider = document.querySelector('[data-layer-name="Line B"] .transparency-slider');
            const message = document.querySelector('.smart-help-message');
            let count = 0;
            const observer = new MutationObserver(records => { count += records.length; });
            observer.observe(message, { childList: true, subtree: true });
            for (let value = 75; value < 95; value++) {
                slider.value = value;
                slider.dispatchEvent(new Event('input', { bubbles: true }));
                await Promise.resolve();
            }
            await Promise.resolve();
            observer.disconnect();
            return count;
        })()`);
        await expectHelp(/Layer opacity/);
        assert.equal(updates, 2);

        await click(control('Line B', '.layer-actions-trigger'));
        await click('[data-layer-floating-root] [data-action="rename"]');
        await expectHelp(/Rename layer/);
        await evaluate("document.querySelector('.layer-rename-input').value = 'Renamed line'");
        await click('.layer-rename-save');
        await expectHelp(/Line layer selected.*Renamed line/);
        await click(control('Renamed line', '.layer-action-btn.danger'));
        await expectHelp(/Confirm the action/);
        await waitFor("() => document.querySelector('#confirmationModal.visible')");
        await click('#confirmationDialogConfirm');
        await waitFor('() => !document.querySelector(\'[data-layer-name="Renamed line"]\')');
        await expectHelp(/Select a layer or choose a tool/);

        await click('[data-draw-mode="line"]');
        await expectHelp(/Line drawing active/);
        await evaluate('finishSketch("drawing", [[-75,-110], [-25,-110]])');
        await expectHelp(/Line drawing added/);
        await escape();
        await mapClick(-50, -110);
        await expectHelp(/Line drawing selected/);
        await mapClick(100, 120);
        await expectHelp(/Select a layer or choose a tool/);

        await click(section('measurement'));
        await click('#measureDistanceBtn');
        await expectHelp(/Distance measurement active/);
        await click(header('Polygon A'));
        await expectHelp(/Distance measurement active/);
        await evaluate('finishSketch("measurement", [[-75,0], [-25,0]])');
        await expectHelp(/Distance measurement selected/);
        await mapClick(60, 44);
        await expectHelp(/Area measurement selected/);
        await click(header('Point C'));
        await expectHelp(/Point layer selected/);
        await mapClick(60, 44);
        await expectHelp(/Area measurement selected/);
        await click('#measureAreaBtn');
        await expectHelp(/Area measurement active/);
        await escape();
        await expectHelp(/Point layer selected/);

        await click(section('annotation'));
        await click('#addTextAnnotationBtn');
        await expectHelp(/Place a text annotation/);
        await mapClick(80, -90);
        await expectHelp(/Add annotation text/);
        await evaluate("document.querySelector('#annotationInput').value = 'New field note'");
        await click('#annotationPopup .annotation-btn.primary');
        await expectHelp(/Point layer selected/);
        await mapClick(-75, -50);
        await expectHelp(/Annotation selected/);
        await click('#editAnnotationBtn');
        await expectHelp(/Edit annotation/);
        await click('#editCancelBtn');
        await expectHelp(/Annotation selected/);
        await click('#moveAnnotationBtn');
        await expectHelp(/Move the selected annotation/);
        await escape();
        await expectHelp(/Annotation selected/);
        await click(header('Polygon A'));
        await evaluate("document.querySelector('[data-help-section=\"annotation\"] .tool-section-header').focus()");
        await expectHelp(/Polygon layer selected/);
        await mapClick(-75, -50);
        await expectHelp(/Annotation selected/);
        await click(header('Polygon A'));
        await expectHelp(/Polygon layer selected/);
        await mapClick(-104, 80);
        await expectHelp(/Vector feature selected.*Polygon A/);
        await mapClick(100, 120);
        await expectHelp(/Polygon layer selected/);

        await click(section('mapSettings'));
        await expectHelp(/Map Settings/);
        await click('#scaleBarToggle');
        await expectHelp(/Scale bar/);
        await click(header('Polygon A'));
        await expectHelp(/Polygon layer selected/);
        await evaluate(`(() => {
            const originalFetch = window.fetch;
            window.fetch = (url, ...args) => String(url).startsWith('https://nominatim.openstreetmap.org/search')
                ? Promise.resolve(new Response(JSON.stringify([{ lat: 14.6, lon: 121, display_name: 'Fixture location' }])))
                : originalFetch(url, ...args);
            const input = document.getElementById('locationSearchInput');
            input.value = 'Fixture location';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
        await expectHelp(/Search for a location/);
        await click('.location-search-submit');
        await expectHelp(/Location found/);
        await click('#locationSearchClear');
        await expectHelp(/Polygon layer selected/);
        await click('#zoomIn');
        await expectHelp(/Navigate the map/);
        await click(header('Polygon A'));
        await expectHelp(/Polygon layer selected/);

        for (const [trigger, id, pattern] of [
            ['.btn-export', 'exportModal', /Export map.*PNG/],
            ['.btn-share', 'shareModal', /Share map.*PNG/],
            ['[onclick="openAttributeTable()"]', 'attributesModal', /Browse layer attributes/],
            ['[onclick="openFeatureSaveDialog()"]', 'featureSaveModal', /Save map features/],
            ['#layersSidebar .btn-upload', 'uploadModal', /Import a Shapefile/]
        ]) {
            await click(trigger);
            await expectHelp(pattern);
            await waitFor(`() => document.getElementById('${id}').classList.contains('visible')`);
            assert.deepEqual(await evaluate(`(() => {
                const panel = document.getElementById('smartHelpPanel');
                return {
                    sidebarOwned: Boolean(panel && document.getElementById('toolsSidebar').contains(panel)),
                    count: document.querySelectorAll('#smartHelpPanel').length,
                    modalCount: document.querySelectorAll('.modal-overlay #smartHelpPanel').length
                };
            })()`), { sidebarOwned: true, count: 1, modalCount: 0 });
            if (id === 'exportModal') {
                await click('[name="exportFormat"][value="pdf"]');
                await expectHelp(/Export map.*PDF/);
            } else if (id === 'shareModal') {
                await evaluate("const format = document.getElementById('shareFormat'); format.value = 'jpeg'; format.dispatchEvent(new Event('change', { bubbles: true }));");
                await expectHelp(/Share map.*JPEG/);
                await evaluate("document.querySelector('#recipientEmail').dispatchEvent(new Event('input', { bubbles: true }))");
                await expectHelp(/Add recipients/);
            } else if (id === 'uploadModal') {
                await evaluate(`const type = document.querySelector('#dataTypeSelect'); type.value = 'csv'; type.dispatchEvent(new Event('change', { bubbles: true }));`);
                await expectHelp(/Import CSV points/);
                await click('#wmsTab');
                await expectHelp(/Connect a WMS service/);
                await evaluate("document.querySelector('#wmsTab').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))");
                await expectHelp(/Import CSV points/);
            }
            await click(`#${id} .modal-close`);
            await waitFor(`() => !document.getElementById('${id}').classList.contains('active')`);
            await expectHelp(/Polygon layer selected/);
        }
        await evaluate("['Polygon A', 'Point C', 'WMS D', 'Geoportal E'].forEach(removeLayerItem)");
        await expectHelp(/Start with a dataset/);
        assert.deepEqual(await evaluate('window.smartHelpPlacementViolations'), []);
    });
});

test('Add Geospatial Data keeps Smart Help in the sidebar during tab, file, and service workflows', browserOptions, async () => {
    const fixture = fileURLToPath(new URL('./fixtures/vector-multitable.gpkg', import.meta.url));
    await withWorkspace(async ({ evaluate, click, waitFor, expectHelp, viewport, screenshot, call }) => {
        await evaluate(`(() => {
            const fetchOriginal = window.fetch;
            const capabilities = '<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">' +
                '<Capability><Layer><Title>Fixture service</Title><Layer><Name>fixture:points</Name>' +
                '<Title>Fixture Points</Title></Layer></Layer></Capability></WMS_Capabilities>';
            window.fetch = (url, ...args) => /request=getcapabilities/i.test(String(url))
                ? Promise.resolve(new Response(capabilities))
                : fetchOriginal(url, ...args);
        })()`);
        const checkTab = async (name, control, action) => {
            assert.deepEqual(await evaluate(`(() => {
                const modal = document.getElementById('uploadModal');
                const body = modal.querySelector('.modal-body');
                const primary = document.getElementById('addDataPrimaryAction');
                const dialog = modal.querySelector('.modal');
                const originalScroll = dialog.scrollTop;
                primary.scrollIntoView({ block: 'nearest' });
                const footer = modal.querySelector('.modal-footer').getBoundingClientRect();
                const primaryBounds = primary.getBoundingClientRect();
                const dialogBounds = dialog.getBoundingClientRect();
                const footerVisible = primaryBounds.top >= Math.max(0, dialogBounds.top, footer.top) - 1 &&
                    primaryBounds.bottom <= Math.min(innerHeight, dialogBounds.bottom, footer.bottom) + 1 &&
                    primary.contains(document.elementFromPoint(primaryBounds.x + primaryBounds.width / 2,
                        primaryBounds.y + primaryBounds.height / 2));
                dialog.scrollTop = originalScroll;
                const panels = Array.from(body.querySelectorAll('[role="tabpanel"]')).filter(panel => !panel.hidden);
                return {
                    tab: panels.map(panel => panel.id),
                    controlVisible: Boolean(document.querySelector('${control}')?.getClientRects().length),
                    sidebarHelp: Boolean(document.querySelector('#toolsSidebar #smartHelpPanel')),
                    totalCards: document.querySelectorAll('#smartHelpPanel').length,
                    modalCards: modal.querySelectorAll('.smart-help-panel').length,
                    footerVisible,
                    horizontalOverflow: body.scrollWidth > body.clientWidth + 1,
                    action: primary.textContent.trim()
                };
            })()`), {
                tab: [name + 'Panel'], controlVisible: true, sidebarHelp: true, totalCards: 1,
                modalCards: 0, footerVisible: true, horizontalOverflow: false, action
            });
        };
        for (const [width, height, mobile] of [[1366, 768, false], [390, 844, true], [844, 390, true]]) {
            await viewport(width, height, mobile);
            if (mobile) await click('[aria-controls="layersSidebar"]');
            await click('#layersSidebar .btn-upload');
            await waitFor("() => document.querySelector('#uploadModal.visible')");
            await waitFor("() => document.querySelector('#uploadModal .modal').getAnimations().length === 0");
            await evaluate(`(() => {
                const select = document.getElementById('dataTypeSelect');
                select.value = 'shapefile';
                select.dispatchEvent(new Event('change', { bubbles: true }));
            })()`);
            await expectHelp(/Import a Shapefile/);
            await checkTab('upload', '#uploadPanel .disclaimer-box', 'Upload');
            await evaluate(`(() => {
                const select = document.getElementById('dataTypeSelect');
                select.value = 'geopackage';
                select.dispatchEvent(new Event('change', { bubbles: true }));
            })()`);
            const { root: { nodeId: documentId } } = await call('DOM.getDocument');
            const { nodeId } = await call('DOM.querySelector', { nodeId: documentId, selector: '#gpkgInput' });
            await call('DOM.setFileInputFiles', { nodeId, files: [fixture] });
            await waitFor("() => document.querySelector('#gpkgTables input')");
            await expectHelp(/Choose GeoPackage tables/);
            await checkTab('upload', '#gpkgTables input', 'Upload');
            await click('#gpkgFilePreview .file-preview-clear');
            await waitFor("() => !document.querySelector('#gpkgTables input')");
            await checkTab('upload', '#gpkgSection .upload-area', 'Upload');

            await click('#wmsTab');
            await expectHelp(/Connect a WMS service/);
            await click('#wmsFetchButton');
            await waitFor("() => document.querySelector('#wmsLayerChecklist input')");
            await checkTab('wms', '#wmsLayerChecklist input', 'Done');
            await click('#geoportalTab');
            await expectHelp(/Browse Geoportal layers/);
            await waitFor("() => document.querySelector('#gpLayerChecklist input')");
            await evaluate(`(() => {
                const search = document.getElementById('gpLayerSearch');
                search.value = 'Fixture Points';
                search.dispatchEvent(new Event('input', { bubbles: true }));
            })()`);
            await waitFor("() => document.querySelector('#gpFetchFeedback').textContent === '1 matching layer'");
            await checkTab('geoportal', '#gpLayerChecklist input', 'Done');
            await screenshot(`add-geospatial-data-${width}x${height}`);
            await click('#uploadTab');
            await checkTab('upload', '#dataTypeSelect', 'Upload');
            await click('#uploadModal .modal-close');
            await waitFor("() => !document.querySelector('#uploadModal.active')");
            if (mobile) await click('#layersSidebar .drawer-close');
        }
    });
});

test('Inspector stays stationary while tool sections scroll and remains reachable on desktop and in the Tools drawer', browserOptions, async () => {
    await withWorkspace(async ({ evaluate, click, waitFor, expectHelp, viewport, mapClick, screenshot }) => {
        await evaluate('restoreFixtures()');
        await click(section('mapSettings'));
        await click(section('drawing'));
        await click(section('measurement'));
        const sizes = [[1920,1080], [1440,900], [1366,768], [1280,800], [1100,700], [1100,481],
            [768,1024], [1024,768], [390,844], [844,390], [915,412]];
        for (const [width, height] of sizes) {
            const mobile = width <= 1024 || height <= 480;
            await viewport(width, height, mobile);
            for (const [x, y, id, pattern] of [
                [-75,-50,'annotationControls', /Annotation selected/],
                [-40,50,'drawingSelectionControls', /Point drawing selected/],
                [55,-110,'drawingSelectionControls', /Line drawing selected/],
                [120,-40,'drawingSelectionControls', /Polygon drawing selected/],
                [-125,25,'drawingSelectionControls', /Freehand drawing selected/],
                [15,-65,'measurementContextPanel', /Distance measurement selected/],
                [60,44,'measurementContextPanel', /Area measurement selected/]
            ]) {
                await mapClick(x, y, true);
                try {
                    await expectHelp(pattern);
                } catch (cause) {
                    const state = await evaluate(`(() => {
                        const pixel = map.getPixelFromCoordinate(fixtureCoordinates['${x},${y}']);
                        return { pixel, hits: map.getFeaturesAtPixel(pixel, { hitTolerance: 8 })
                            .map(feature => feature.get('text') || feature.get('drawingType') || feature.get('measurementType')) };
                    })()`);
                    throw new Error(`Inspector selection at ${width}x${height}: ${JSON.stringify(state)}`, { cause });
                }
                if (mobile) await click(tools);
                await waitFor(`() => getComputedStyle(document.getElementById('${id}')).opacity === '1'`);
                const metrics = await evaluate(`(() => {
                    const inspector = document.querySelector('.contextual-inspector');
                    const panel = document.getElementById('${id}');
                    const help = document.getElementById('smartHelpPanel');
                    const main = document.querySelector('.right-sidebar-main');
                    const tools = document.querySelector('.right-sidebar-scroll');
                    const header = document.querySelector('.right-sidebar-header');
                    const fallback = !${mobile} && main.classList.contains('is-height-constrained');
                    const wholeSidebar = ${mobile} || fallback;
                    const scroll = wholeSidebar ? main : tools;
                    const reachable = element => {
                        if (wholeSidebar) element.scrollIntoView({ block: 'center' });
                        const { left, right, top, bottom } = element.getBoundingClientRect();
                        const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
                        const bounds = main.getBoundingClientRect();
                        return element.contains(hit) && top >= bounds.top - 1 && bottom <= bounds.bottom + 1 &&
                            left >= bounds.left - 1 && right <= bounds.right + 1;
                    };
                    const start = main.scrollTop;
                    const tops = () => [header, inspector, help].map(el => el.getBoundingClientRect().top);
                    const initialTops = tops();
                    scroll.scrollTop = scroll.scrollHeight;
                    const scrolled = scroll.scrollTop > 0;
                    const stationary = tops().every((top, index) => Math.abs(top - initialTops[index]) < 1);
                    scroll.scrollTop = 0;
                    const buttons = [...panel.querySelectorAll('button')];
                    const details = [...panel.querySelectorAll('.context-controls-label, .context-controls-hint, .annotation-controls-hint, .measure-results-title-text, .measure-result-value')]
                        .filter(el => el.getClientRects().length);
                    const reachableActions = buttons.map(el => [el.textContent.trim(), !el.disabled && reachable(el)]);
                    const reachableDetails = details.map(el => [el.textContent.trim(), reachable(el)]);
                    const footer = reachable(help.querySelector('#smartHelpSecondary'));
                    const inspectorBounds = inspector.getBoundingClientRect();
                    const toolsBounds = tools.getBoundingClientRect();
                    const helpBounds = help.getBoundingClientRect();
                    const helpStyle = getComputedStyle(help);
                    const availableTools = main.clientHeight - header.offsetHeight - inspector.offsetHeight - help.offsetHeight -
                        parseFloat(helpStyle.marginTop) - parseFloat(helpStyle.marginBottom);
                    const firstTool = tools.querySelector('.tool-section-header');
                    const minimumTools = firstTool.offsetHeight + parseFloat(getComputedStyle(firstTool.closest('.right-sidebar-content')).paddingTop);
                    const info = {
                        start, fallback, stationary, scrolled, reachableActions, reachableDetails, footer,
                        availableTools, minimumTools,
                        inspectorHeight: inspector.clientHeight, inspectorScrollHeight: inspector.scrollHeight,
                        inspectorOverflow: getComputedStyle(inspector).overflowY,
                        toolsOverflow: getComputedStyle(tools).overflowY,
                        overflow: scroll.scrollWidth - scroll.clientWidth,
                        pageOverflow: document.documentElement.scrollWidth - innerWidth,
                        edgeAccent: (() => {
                            const style = getComputedStyle(help);
                            const edgeBorders = ['borderTop', 'borderRight', 'borderBottom', 'borderLeft']
                                .map(side => style[side]);
                            const pseudoAccents = ['::before', '::after'].some(pseudo => {
                                const decoration = getComputedStyle(help, pseudo);
                                return decoration.content !== 'none' && decoration.content !== 'normal' &&
                                    (decoration.width !== 'auto' || decoration.height !== 'auto') &&
                                    decoration.backgroundImage !== 'none';
                            });
                            return {
                                pseudoAccents,
                                uniformBorder: edgeBorders.every(border => border === edgeBorders[0]) &&
                                    edgeBorders[0].includes('rgb(203, 213, 225)')
                            };
                        })(),
                        bulb: Boolean(help.querySelector('.fa-lightbulb')),
                        count: document.querySelectorAll('#smartHelpPanel').length,
                        scrolls: getComputedStyle(scroll).overflowY,
                        clipped: panel.scrollHeight > panel.clientHeight + 1,
                        desktopLayout: Math.abs(inspectorBounds.top - header.getBoundingClientRect().bottom) < 1 &&
                            Math.abs(inspectorBounds.bottom - toolsBounds.top) < 1 && toolsBounds.bottom <= helpBounds.top &&
                            Math.abs(main.getBoundingClientRect().bottom - helpBounds.bottom - parseFloat(getComputedStyle(help).marginBottom)) < 1
                    };
                    scroll.scrollTop = 0;
                    return info;
                })()`);
                const label = `${width}x${height} ${pattern}: ${JSON.stringify(metrics)}`;
                assert.equal(metrics.start, 0, label);
                assert.equal(metrics.reachableActions.length, id === 'annotationControls' ? 6 : 2, label);
                assert.ok(metrics.reachableActions.every(([, visible]) => visible) &&
                    metrics.reachableDetails.length > 0 && metrics.reachableDetails.every(([, visible]) => visible), label);
                assert.ok(metrics.footer && !metrics.clipped && metrics.inspectorOverflow === 'visible' &&
                    metrics.inspectorScrollHeight <= metrics.inspectorHeight + 1, label);
                assert.ok(metrics.scrolled, label);
                if (!mobile) assert.equal(metrics.fallback, metrics.availableTools < metrics.minimumTools, label);
                if (!mobile && (height >= 900 || (height >= 768 && id !== 'measurementContextPanel'))) {
                    assert.ok(!metrics.fallback, label);
                }
                if (height === 481 && id === 'measurementContextPanel') assert.ok(metrics.fallback, label);
                if (!mobile && !metrics.fallback) assert.ok(metrics.stationary && metrics.desktopLayout, label);
                else assert.ok(!metrics.stationary && metrics.toolsOverflow === 'visible', label);
                assert.ok(metrics.overflow <= 1 && metrics.pageOverflow <= 1, label);
                assert.deepEqual([metrics.count, metrics.edgeAccent, metrics.bulb, metrics.scrolls],
                    [1, { pseudoAccents: false, uniformBorder: true }, true, 'auto'], label);
                if (width === 1920 && id === 'annotationControls') await screenshot('smart-help-navy-1920x1080');
                if ((width === 1440 || width === 1366 || width === 390 || width === 844 || height === 481) && pattern.source.startsWith('Area')) {
                    await screenshot(`area-inspector-${width}x${height}`);
                    if (mobile || metrics.fallback) {
                        await evaluate("document.querySelector('.clear-measurements-btn').scrollIntoView({ block: 'end' })");
                        await screenshot(`area-actions-${width}x${height}`);
                        await evaluate("document.getElementById('smartHelpPanel').scrollIntoView({ block: 'end' })");
                        await screenshot(`smart-help-${width}x${height}`);
                    }
                }
                await evaluate(`document.querySelector('${mobile || metrics.fallback ? '.right-sidebar-main' : '.right-sidebar-scroll'}').scrollTop = 80`);
                if (mobile) {
                    await click('#toolsSidebar .drawer-close');
                    assert.equal(await evaluate("document.activeElement.getAttribute('aria-controls')"), 'toolsSidebar');
                }
            }
        }
        await viewport(1100, 700);
        await click('.right-sidebar-layout-handle');
        await waitFor("() => document.getElementById('toolsSidebar').classList.contains('is-collapsed')");
        await click('.right-sidebar-layout-handle');
        await expectHelp(/Area measurement selected/);
        await mapClick(100, 120);
        await waitFor("() => document.querySelector('.contextual-inspector').hidden");
        await expectHelp(/Start with a dataset/);

        await evaluate("window.previousHelp = document.querySelector('#smartHelpPrimary').textContent; document.querySelector('#smartHelpPrimary').textContent = 'LongGuidance'.repeat(150)");
        await waitFor("() => document.querySelector('.right-sidebar-main').classList.contains('is-height-constrained')");
        const longText = await evaluate(`(() => {
            const panel = document.getElementById('smartHelpPanel');
            const secondary = document.getElementById('smartHelpSecondary');
            const sidebar = panel.parentElement;
            panel.focus({ preventScroll: true });
            sidebar.scrollTop = sidebar.scrollHeight;
            const bounds = secondary.getBoundingClientRect();
            const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            return {
                horizontal: panel.scrollWidth - panel.clientWidth,
                footerEndVisible: bounds.bottom <= sidebar.getBoundingClientRect().bottom + 1 && secondary.contains(hit),
                bottom: bounds.bottom,
                sidebarBottom: sidebar.getBoundingClientRect().bottom,
                scrollTop: sidebar.scrollTop,
                focusable: document.activeElement === panel
            };
        })()`);
        assert.ok(longText.horizontal <= 1 && longText.footerEndVisible && longText.focusable, JSON.stringify(longText));
        await evaluate("document.querySelector('#smartHelpPrimary').textContent = previousHelp");
        await waitFor("() => !document.querySelector('.right-sidebar-main').classList.contains('is-height-constrained')");
    });
});
