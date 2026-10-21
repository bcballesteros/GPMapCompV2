async function runGeoPackageBrowser(fixtures) {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const wait = async (predicate, message) => {
        const deadline = Date.now() + 20000;
        while (!predicate()) {
            if (Date.now() > deadline) throw new Error(`Timed out: ${message}; feedback: ${document.getElementById('gpkgFeedback')?.textContent}`);
            await new Promise(resolve => setTimeout(resolve, 25));
        }
    };
    await wait(() => window.__testState.map && window.openAddGeospatialData && document.body.classList.contains('app-ready'), 'app startup');
    assert(!performance.getEntriesByType('resource').some(entry => /geopackage|sql-wasm/.test(entry.name)), 'Ordinary startup must not load GeoPackage engine');
    const map = window.__testState.map;
    // Keep tests offline and deterministic; the real uploaded vector rendering remains active.
    map.getLayers().getArray().slice().forEach(layer => map.removeLayer(layer));
    const choose = async (bytes, name = 'municipality.gpkg') => {
        window.openAddGeospatialData();
        const select = document.getElementById('dataTypeSelect'); select.value = 'geopackage'; select.dispatchEvent(new Event('change'));
        const transfer = new DataTransfer();
        transfer.items.add(new File([Uint8Array.from(atob(bytes), char => char.charCodeAt(0))], name));
        const input = document.getElementById('gpkgInput'); input.files = transfer.files; input.dispatchEvent(new Event('change'));
        await wait(() => document.getElementById('addDataPrimaryAction').dataset.uploadBusy !== 'true', 'table discovery');
    };
    const upload = async () => {
        document.getElementById('addDataPrimaryAction').click();
        document.getElementById('addDataPrimaryAction').click(); // Disabled/reentrant submissions must do nothing.
        await wait(() => document.getElementById('addDataPrimaryAction').dataset.uploadBusy !== 'true', 'table import');
    };
    const layers = () => window.__testState.uploadedLayers || {};
    await choose(btoa('not a sqlite database'), 'invalid.gpkg');
    assert(/empty|SQLite/.test(document.getElementById('gpkgFeedback').textContent), 'Invalid file feedback');
    await choose(fixtures.valid);
    assert(document.querySelectorAll('#gpkgTables input:checked').length === 3, 'All supported tables initially selected');
    assert(document.getElementById('gpkgFileName').textContent === 'municipality.gpkg', 'Filename displayed');
    assert(document.getElementById('gpkgFileSize').textContent, 'File size displayed');
    document.querySelector('#gpkgTables input[value="roads"]').checked = false;
    document.querySelector('#gpkgTables input[value="land_use"]').checked = false;
    await upload();
    assert(Object.keys(layers()).join() === 'Facilities', 'Only selected table imported');
    const facility = layers().Facilities;
    assert(facility.sourceFormat === 'geopackage' && facility.sourceTableName === 'facilities', 'Source metadata');
    const coordinate = facility.features[0].getGeometry().getCoordinates();
    assert(Math.abs(coordinate[0] - 13469658.385986103) < 1e-6 && Math.abs(coordinate[1] - 1574216.548161465) < 1e-6, 'Correct position');
    await wait(() => !map.getView().getAnimating(), 'point fit');
    assert(Math.abs(map.getView().getCenter()[0] - coordinate[0]) < 1, 'Single point zoom-to-layer');
    window.selectLayer(document.querySelector('.layer-item')); window.openAttributeTable();
    assert(document.getElementById('attributeTableContainer').textContent.includes('9007199254740993'), 'Large integers in attribute table');
    assert(!document.querySelector('#attributeTableContainer img'), 'Attributes cannot inject HTML');
    window.closeModal('attributesModal');
    await choose(fixtures.valid);
    await upload();
    assert(Object.keys(layers()).sort().join() === ['Facilities', 'Facilities 2', 'Land Use', 'Roads'].sort().join(), 'Distinct tables and duplicate names');
    await choose(fixtures.bad); await upload();
    assert(Object.keys(layers()).length === 4 && /bad:/.test(document.getElementById('gpkgFeedback').textContent), 'Failed selected table leaves no partial batch');
    await choose(fixtures.valid);
    const originalAddLayer = map.addLayer;
    const beforeCount = map.getLayers().getLength();
    let registrations = 0;
    map.addLayer = function (layer) {
        originalAddLayer.call(this, layer);
        if (++registrations === 2) throw new Error('Synthetic registration failure');
    };
    await upload(); map.addLayer = originalAddLayer;
    assert(Object.keys(layers()).length === 4 && map.getLayers().getLength() === beforeCount, 'Registration rollback removes records, panel entries and map layers');
    assert(document.querySelectorAll('.layer-item').length === 4, 'Registration rollback leaves no orphan panel entries');
    await choose(fixtures.valid);
    document.querySelectorAll('#gpkgTables input').forEach(input => { input.checked = false; });
    await upload();
    assert(/at least one/.test(document.getElementById('gpkgFeedback').textContent), 'Selection feedback: ' + document.getElementById('gpkgFeedback').textContent);
    window.clearGeoPackageSelection();
    assert(!document.querySelector('#gpkgTables input') && window.currentLayerData === null, 'Clear selection');
    await choose(fixtures.valid);
    window.closeModal('uploadModal');
    await wait(() => !document.querySelector('#gpkgTables input'), 'close releases selection');
    await choose(fixtures.mercator);
    assert(document.querySelectorAll('#gpkgTables input:checked').length === 1, 'Single table default selection');
    await upload();
    assert(layers().Mercator.sourceCrs === 'EPSG:3857', 'Projected source CRS metadata');
    assert(Math.abs(layers().Mercator.features[0].getGeometry().getCoordinates()[0] - coordinate[0]) < 1e-6, 'Projected import position');

    const findItem = name => [...document.querySelectorAll('.layer-item')].find(item => item.dataset.layerName === name);
    const pointItem = findItem('Facilities');
    pointItem.querySelector('.layer-toggle').click();
    assert(!facility.layer.getVisible(), 'Layer visibility control');
    pointItem.querySelector('.layer-toggle').click();
    const slider = pointItem.querySelector('.transparency-slider'); slider.value = 50; slider.dispatchEvent(new Event('input', { bubbles: true }));
    assert(facility.opacity === 0.5, 'Layer opacity control');
    const colorControl = pointItem.querySelector('.color-picker'); colorControl.value = '#ff0000';
    window.updateLayerColor(colorControl);
    assert(facility.color === '#ff0000', 'Shared styling control');
    const sld = symbolizer => `<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0"><NamedLayer><UserStyle><FeatureTypeStyle><Rule><Title>Category A</Title><ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>category</ogc:PropertyName><ogc:Literal>A</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>${symbolizer}</Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`;
    for (const [name, symbolizer] of [
        ['Facilities', '<PointSymbolizer><Graphic><Mark><WellKnownName>square</WellKnownName><Fill><CssParameter name="fill">#cc0000</CssParameter></Fill></Mark><Size>14</Size></Graphic></PointSymbolizer>'],
        ['Roads', '<LineSymbolizer><Stroke><CssParameter name="stroke">#cc0000</CssParameter><CssParameter name="stroke-width">3</CssParameter></Stroke></LineSymbolizer>'],
        ['Land Use', '<PolygonSymbolizer><Fill><CssParameter name="fill">#00aa00</CssParameter></Fill></PolygonSymbolizer>']
    ]) {
        const item = findItem(name);
        const input = item.querySelector('input[accept=".sld"]');
        const transfer = new DataTransfer(); transfer.items.add(new File([sld(symbolizer)], 'category.sld'));
        input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(() => !item.querySelector('.vector-sld-import, .polygon-sld-import').disabled, 'SLD import');
        const status = item.querySelector('.polygon-sld-status');
        assert(status?.dataset.error !== 'true', `SLD import ${name}: ${status?.textContent}`);
        assert(item.textContent.includes('Category A'), `Shared legend for ${name}`);
    }
    // Capture actual output text and bytes without saving downloads or sending email.
    const text = [];
    const originalFillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) { text.push(String(value)); return originalFillText.call(this, value, ...args); };
    const blobs = [];
    const originalCreateUrl = URL.createObjectURL;
    URL.createObjectURL = blob => { blobs.push(blob); return originalCreateUrl(blob); };
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (!this.download) originalClick.call(this); };
    map.getView().cancelAnimations();
    map.getView().setCenter(coordinate); map.getView().setZoom(7); map.renderSync();
    window.openModal('exportModal');
    await wait(() => document.querySelector('#exportModal canvas[role="img"]'), 'export preview');
    const preview = document.querySelector('#exportModal canvas[role="img"]');
    assert(preview.width > 0 && preview.toDataURL().length > 1000, 'Generated preview image');
    preview.parentElement.click();
    await wait(() => document.querySelector('.map-preview-viewer[open]'), 'enlarged preview');
    document.querySelector('.map-preview-viewer [data-action="close"]').click();
    const formats = [];
    for (const format of ['png', 'jpeg', 'pdf']) {
        document.querySelector(`input[name="exportFormat"][value="${format}"]`).checked = true;
        const count = blobs.length; await window.downloadMap();
        assert(blobs.length > count, `${format} generated`);
        const blob = blobs.at(-1); formats.push(blob.type);
        const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
        assert(format === 'png' ? header[0] === 137 : format === 'jpeg' ? header[0] === 255 : new TextDecoder().decode(header) === '%PDF-', `${format} valid signature`);
    }
    assert(text.includes('Facilities') && text.includes('Roads') && text.includes('Land Use') && text.includes('Category A'), 'Output includes vector headings and SLD legend labels');
    layers().Roads.layer.setVisible(false); text.length = 0;
    await window.renderMapPreview('hidden-layer-test', 'export');
    assert(!text.includes('Roads') && text.includes('Land Use'), 'Hidden vector layers excluded from output legends');
    layers().Roads.layer.setVisible(true);
    window.openModal('shareModal');
    await wait(() => document.querySelector('#shareModal canvas[role="img"]'), 'Share preview');
    const originalFetch = window.fetch;
    let shareRequests = 0;
    window.fetch = async (url, options) => {
        if (String(url).includes('/api/share')) { shareRequests++; return { ok: true, json: async () => ({ success: true, message: 'Test share accepted' }) }; }
        return originalFetch(url, options);
    };
    document.getElementById('recipientEmail').value = 'qa@example.test';
    assert(await window.sendMap(), 'Share output accepted by mocked endpoint');
    assert(shareRequests === 1, 'Exactly one mock Share request');
    window.fetch = originalFetch;
    CanvasRenderingContext2D.prototype.fillText = originalFillText;
    URL.createObjectURL = originalCreateUrl;
    HTMLAnchorElement.prototype.click = originalClick;
    window.closeModal('shareModal');
    const regressionFormats = [];
    for (const [type, inputId, content, filename] of [
        ['geojson', 'geojsonInput', JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'sample' }, geometry: { type: 'Point', coordinates: [121, 14] } }] }), 'regression.geojson'],
        ['kml', 'kmlInput', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>sample</name><Point><coordinates>121,14</coordinates></Point></Placemark></Document></kml>', 'regression.kml'],
        ['csv', 'csvInput', 'name,latitude,longitude\nsample,14,121', 'regression.csv'],
        ['shapefile', 'fileInput', Uint8Array.from(atob(fixtures.shapefile), char => char.charCodeAt(0)), 'regression.zip']
    ]) {
        window.openAddGeospatialData();
        const selector = document.getElementById('dataTypeSelect'); selector.value = type; selector.dispatchEvent(new Event('change'));
        const transfer = new DataTransfer(); transfer.items.add(new File([content], filename));
        const input = document.getElementById(inputId); input.files = transfer.files; input.dispatchEvent(new Event('change'));
        const before = Object.keys(layers()).length;
        await upload();
        assert(Object.keys(layers()).length === before + 1, `${type} regression upload`);
        const record = Object.values(layers()).at(-1);
        assert(Math.abs(record.features[0].getGeometry().getCoordinates()[0] - coordinate[0]) < 1e-6, `${type} geographic position`);
        regressionFormats.push(type);
    }
    const OriginalWorker = window.Worker; window.Worker = undefined;
    await choose(fixtures.valid);
    assert(/Web Workers and WebAssembly/.test(document.getElementById('gpkgFeedback').textContent), 'Unsupported browser feedback');
    window.Worker = OriginalWorker;
    await choose(fixtures.valid); window.clearGeoPackageSelection();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    assert(window.__testErrors.length === 0, `Uncaught JavaScript errors: ${window.__testErrors.join('; ')}`);
    const assets = performance.getEntriesByType('resource').filter(entry => /geopackage\.worker/.test(entry.name));
    return { layers: Object.keys(layers()).length, formats, regressionFormats, workers: assets.length, share: 'mocked transport; real rendered output', preview: [preview.width, preview.height] };
}
