import { parseSld } from '/src/map/sld-importer.js';
import { applyImportedVectorStyle, switchVectorStyleMode } from '/src/map/vector-sld-symbology.js';
import { createManagedFeatureStyles } from '/src/map/style-factory.js';
import { getSymbologyRuntime } from '/src/map/symbology-common.js';
import { addVectorLayer, getManagedLayerLegendDescriptors, removeManagedLayer, updateManagedLayerStyle } from '/src/map/layer-manager.js';
import { getLayerRecord, setMap } from '/src/state/store.js';
import { addLayerItem } from '/src/ui/layers-panel.js';
import ol from '/src/lib/ol.js';

export async function verifyVectorSld({ assert, reject, change }) {
    const pointXml = await (await fetch('/tests/fixtures/categorized-point.sld')).text();
    const lineXml = await (await fetch('/tests/fixtures/categorized-line.sld')).text();
    const p = parseSld(pointXml), l = parseSld(lineXml);
    assert(p.geometryType === 'point' && l.geometryType === 'line', 'Namespace independent point/line geometry detection');
    assert(l.rules[0].symbolizers.length === 2 && l.rules[0].symbolizers[0].stroke.lineJoin === 'miter', 'Ordered line strokes and SLD mitre spelling');
    const uniform = body => `<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" version="1.0.0"><NamedLayer><UserStyle><FeatureTypeStyle><Rule>${body}</Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`;
    const point = mark => `<PointSymbolizer><Graphic><Mark>${mark}</Mark><Size>16</Size></Graphic></PointSymbolizer>`;
    const line = body => `<LineSymbolizer><Stroke>${body}</Stroke></LineSymbolizer>`;
    for (const shape of ['circle', 'square', 'triangle', 'star']) {
        assert(parseSld(uniform(point(`<WellKnownName>${shape}</WellKnownName><Fill/>`))).rules[0].symbolizers[0].shape === shape, `Native mark ${shape}`);
    }
    const defaults = parseSld(uniform(line(''))).rules[0].symbolizers[0].stroke;
    assert(defaults.color === '#000000' && defaults.width === 1 && defaults.opacity === 1 && defaults.specified.length === 0 && !defaults.dashArray, 'Omitted line properties retain SLD defaults and omission metadata');
    assert(parseSld(uniform(point('<Fill/>'))).rules[0].symbolizers[0].shape === 'square', 'Default mark is square');
    for (const shape of ['cross', 'x', 'diamond', 'url(https://example.invalid/x)']) reject(uniform(point(`<WellKnownName>${shape}</WellKnownName><Fill/>`)), /Unsupported point mark/);
    for (const size of ['0', '-1', '129', 'NaN', 'Infinity']) reject(pointXml.replace('<Size>16</Size>', `<Size>${size}</Size>`), /point Size/);
    for (const [tag, invalid] of [['Rotation', '361'], ['Rotation', 'NaN'], ['Opacity', '1.1']]) reject(pointXml.replace(`<${tag}>${tag === 'Rotation' ? '30' : '0.5'}</${tag}>`, `<${tag}>${invalid}</${tag}>`), new RegExp(tag));
    reject(pointXml.replace('<Mark>', '<ExternalGraphic><OnlineResource/></ExternalGraphic><Mark>'), /ExternalGraphic/);
    reject(pointXml.replace('<Fill>', '<Fill><GraphicFill><Graphic><Mark/></Graphic></GraphicFill>'), /GraphicFill/);
    reject(pointXml.replace('>2</CssParameter>', '>17</CssParameter>'), /Point stroke-width/);
    reject(pointXml.replace('<Mark>', '<Mark/><Mark>'), /Mark/);
    reject(pointXml.replace('<FeatureTypeStyle>', '<FeatureTypeStyle/><FeatureTypeStyle>'), /FeatureTypeStyle/);
    reject(pointXml.replace('</NamedLayer>', '</NamedLayer><NamedLayer/>'), /one SLD layer/);
    reject(pointXml.replace('<ogc:PropertyIsEqualTo>', '<ogc:PropertyIsEqualTo matchCase="false">'), /matchCase/);
    reject(pointXml.replaceAll('PropertyIsEqualTo', 'PropertyIsLike'), /PropertyIsLike/);
    reject(pointXml.replace('<Rule>', '<Rule><ElseFilter/>'), /ElseFilter/);
    reject(pointXml.replace('<Rule>', '<Rule><MaxScaleDenominator>20</MaxScaleDenominator>'), /MaxScale/);
    reject(pointXml.replace('<Rule>', '<Rule><LineSymbolizer><Stroke/></LineSymbolizer>'), /Mixed/);
    reject(lineXml.replace('<s:Stroke>', '<s:Stroke><s:GraphicStroke/>'), /GraphicStroke/);
    reject(lineXml.replace('stroke-dasharray', 'stroke-dashoffset'), /stroke-dashoffset/);
    for (const dash of ['', '0 0', '-1 2', 'NaN 2', '1025 2', '0.00001', '1024 1024 1024', Array(33).fill('1').join(' '), '2,3']) {
        reject(uniform(line(`<CssParameter name="stroke-dasharray">${dash}</CssParameter>`)), /dasharray/);
    }
    for (const [name, value] of [['stroke-linecap', 'triangle'], ['stroke-linejoin', 'arcs'], ['stroke-opacity', '2'], ['stroke-width', '-1'], ['stroke', 'red']]) {
        reject(uniform(line(`<CssParameter name="${name}">${value}</CssParameter>`)), /stroke/);
    }
    const odd = parseSld(uniform(line('<CssParameter name="stroke-dasharray">1 2 3</CssParameter>')));
    assert(odd.rules[0].symbolizers[0].stroke.dashArray.join() === '1,2,3', 'Odd dash array preserves native repeated alternating semantics');
    // A bounded point resource budget is checked before any OL allocation.
    const hugeRules = Array.from({ length: 100 }, (_, i) => `<Rule><ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>kind</ogc:PropertyName><ogc:Literal>${i}</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>${point(`<Fill><CssParameter name="fill">#${i.toString(16).padStart(6, '0')}</CssParameter></Fill><Stroke><CssParameter name="stroke-width">16</CssParameter></Stroke>`).replace('<Size>16</Size>', '<Size>128</Size>')}</Rule>`).join('');
    reject(pointXml.replace(/<Rule>[\s\S]*<\/Rule>/, hugeRules), /resource budget/);

    const mapHost = document.createElement('div'); mapHost.style.cssText = 'width:300px;height:200px;position:fixed;left:300px;top:0;background:white'; document.body.appendChild(mapHost);
    const map = new ol.Map({ target: mapHost, layers: [], view: new ol.View({ center: [0, 0], resolution: 1 }) });
    setMap(map);
    const errors = [];
    const onError = event => errors.push(event.message);
    window.addEventListener('error', onError);
    try {
        for (const type of ['point', 'line']) {
            const xml = type === 'point' ? pointXml : lineXml;
            const name = `SLD ${type}`;
            const geometries = type === 'point' ? [
                { type: 'Point', coordinates: [-60, 20] }, { type: 'MultiPoint', coordinates: [[0, 20], [40, 20]] },
                { type: 'Point', coordinates: [80, 20] }, { type: 'Point', coordinates: [110, 20] }
            ] : [
                { type: 'LineString', coordinates: [[-100, -20], [-40, -20], [-40, -45]] },
                { type: 'MultiLineString', coordinates: [[[0, -20], [40, -20]], [[0, -50], [40, -50]]] },
                { type: 'LineString', coordinates: [[60, -20], [90, -20]] }, { type: 'LineString', coordinates: [[100, -20], [120, -20]] }
            ];
            const geojson = { type: 'FeatureCollection', features: geometries.map((geometry, i) => ({ type: 'Feature', geometry, properties: { kind: ['primary', 'secondary', null, 'other'][i] } })) };
            const features = new ol.format.GeoJSON().readFeatures(geojson);
            const r = addVectorLayer(name, '#654321', geojson, features);
            r.opacity = 0.6;
            addLayerItem(name, r.color, features.length);
            const item = [...document.querySelectorAll('.layer-item')].find(node => node.dataset.layerName === name);
            item.classList.remove('collapsed');
            const input = item.querySelector('.vector-sld-input'), button = item.querySelector('.vector-sld-import'), status = item.querySelector('.vector-sld-status');
            const mode = item.querySelector('.vector-style-mode'), manual = item.querySelector('.vector-manual-controls');
            const legend = item.querySelector('.vector-legend .polygon-legend-entries');
            const upload = async (text, filename = 'example.sld') => {
                const transfer = new DataTransfer(); transfer.items.add(new File([text], filename)); input.files = transfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                const deadline = Date.now() + 3000;
                while (button.disabled && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
                assert(!button.disabled, 'Import completes');
            };
            let opened = false;
            input.addEventListener('click', event => { event.preventDefault(); opened = true; });
            button.click(); assert(opened && input.accept === '.sld', `${type} optional file picker`);
            const manualStyle = r.layer.getStyleFunction()(features[0])[0];
            await upload(xml);
            assert(status.dataset.error === 'false' && status.textContent.includes('2 matched') && status.textContent.includes('2 unmatched'), `${type} import diagnostics`);
            assert(mode.value === 'imported' && manual.disabled && item.querySelector('.color-picker').matches(':disabled'), `${type} conflicting controls disabled`);
            assert(!item.querySelector('.transparency-slider').matches(':disabled'), 'Opacity stays editable');
            assert(legend.children.length === (type === 'point' ? 3 : 2) && legend.firstElementChild.textContent.includes('Primary'), `${type} initial legend updates immediately`);
            assert(item.querySelector('.vector-legend').previousElementSibling.querySelector('.transparency-slider'), 'Legend remains after opacity and before Remove');
            assert(item.querySelector('.vector-legend').nextElementSibling.querySelector('.layer-action-btn'), 'Remove remains after legend');
            assert(r.layer.getStyleFunction()(features[2]).length === 0 && r.layer.getStyleFunction()(features[3]).length === 0, 'Unmatched features have no default symbols');
            const styles = r.layer.getStyleFunction()(features[0]);
            assert(styles[0] !== manualStyle && styles[0] === r.layer.getStyleFunction()(features[0])[0], 'Immediate native rendering and style cache reuse');
            if (type === 'point') {
                assert(styles[0].getImage() instanceof ol.style.Circle === false, 'Square uses native RegularShape');
                assert(styles[0].getImage().getRotation() === Math.PI / 6 && styles[0].getImage().getOpacity() === 0.3, 'Point rotation/graphic opacity');
                assert(r.layer.getStyleFunction()(features[1])[0].getImage().getStroke() === null, 'Missing point stroke stays disabled');
                const canvas = legend.querySelector('canvas'), ctx = canvas.getContext('2d');
                const pixel = ctx.getImageData(32, 26, 1, 1).data;
                assert(pixel[0] > 210 && pixel[1] < 75 && pixel[3] > 33 && pixel[3] < 43, `Point legend native fill alpha ${pixel}`);
            } else {
                const swatch = legend.querySelectorAll('line');
                assert(styles.length === 2 && swatch.length === 3, 'Layered line strokes in map and legend');
                assert(styles[0].getStroke().getWidth() === 6 && styles[1].getStroke().getLineDash().join() === '5,3', 'Native width/dash');
                assert(swatch[0].getAttribute('stroke') === '#123456' && swatch[0].getAttribute('stroke-opacity') === '0.3', 'Legend line color and effective opacity');
                assert(swatch[1].getAttribute('stroke-dasharray') === '5 3' && swatch[1].getAttribute('stroke-linecap') === 'round', 'Legend dash/cap');
            }
            map.renderSync(); await new Promise(resolve => requestAnimationFrame(resolve)); map.renderSync();
            const mapCanvas = map.getViewport().querySelector('canvas');
            assert(mapCanvas, 'Native map rendered');
            const mapCtx = mapCanvas.getContext('2d');
            const pos = map.getPixelFromCoordinate(type === 'point' ? [-60, 20] : [-80, -20]);
            const dpr = mapCanvas.width / map.getSize()[0];
            const pixel = mapCtx.getImageData(Math.round(pos[0] * dpr), Math.round(pos[1] * dpr), 1, 1).data;
            assert(pixel[3] > 0 && pixel[0] !== 37, `${type} actual map uses imported paint ${pixel}`);
            // All four native marks get drawn, including a layered point rule.
            if (type === 'point') {
                for (const shape of ['circle', 'square', 'triangle', 'star']) {
                    const candidate = parseSld(uniform(point(`<WellKnownName>${shape}</WellKnownName><Fill/>`)));
                    applyImportedVectorStyle(r, candidate); updateManagedLayerStyle(name); map.renderSync();
                    assert(r.layer.getStyleFunction()(features[0])[0].getImage().getImage(1).width > 0, `Rendered ${shape}`);
                }
                const layered = parseSld(uniform(point('<Fill/>') + point('<WellKnownName>circle</WellKnownName><Stroke/>')));
                applyImportedVectorStyle(r, layered); updateManagedLayerStyle(name);
                assert(r.layer.getStyleFunction()(features[0]).length === 2 && legend.children.length === 1, 'Ordered layered point symbols');
                await upload(xml);
            }
            const snapshot = JSON.stringify(r.symbology), cached = r.layer.getStyleFunction()(features[0])[0], legendBefore = legend.innerHTML;
            for (const [invalid, filename] of [[type === 'point' ? lineXml : pointXml, 'wrong-geometry.sld'], [xml.replaceAll('>kind<', '>missing<'), 'missing.sld'], [xml.replaceAll('>primary<', '>absent<').replaceAll('>secondary<', '>absent2<'), 'no-matches.sld'], ['<broken>', 'bad.sld'], [xml, 'bad.xml']]) {
                await upload(invalid, filename);
                assert(status.dataset.error === 'true' && JSON.stringify(r.symbology) === snapshot && legend.innerHTML === legendBefore && r.layer.getStyleFunction()(features[0])[0] === cached, `${type} failed import fully preserves styling`);
            }
            change(mode, 'manual');
            assert(!manual.disabled && legend.children.length === 1, 'Manual controls and legend restored');
            if (type === 'point') {
                r.svgMarkerDataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#654321"/></svg>');
                r.markerPresetType = null; updateManagedLayerStyle(name);
                assert(r.layer.getStyleFunction()(features[0])[0].getImage().getSrc().startsWith('data:image/svg+xml'), 'Manual custom SVG remains functional');
                change(mode, 'imported'); change(mode, 'manual');
                assert(r.svgMarkerDataUrl && r.layer.getStyleFunction()(features[0])[0].getImage().getSrc().startsWith('data:image/svg+xml'), 'Custom SVG survives import/manual round trip');
            }
            change(item.querySelector(type === 'point' ? '.point-size-slider' : '.line-width-slider'), '9', 'input');
            assert((type === 'point' ? r.pointSize : r.lineStrokeWidth) === 9, 'Manual size/width remains functional');
            change(mode, 'imported');
            assert(r.layer.getStyleFunction()(features[0])[0] !== cached && manual.disabled, 'Restoring import invalidates cache');
            change(item.querySelector('.transparency-slider'), '40', 'input');
            if (type === 'point') assert(r.layer.getStyleFunction()(features[0])[0].getImage().getOpacity() === 0.2, 'Point opacity synchronized');
            else assert(r.layer.getStyleFunction()(features[0])[0].getStroke().getColor() === 'rgba(18, 52, 86, 0.2)', 'Line opacity synchronized');
            const descriptors = getManagedLayerLegendDescriptors(name);
            assert(descriptors[0].symbols[0].opacity === (type === 'point' ? 0.2 : 0.4), 'Legend opacity uses same resolver');
            await upload(xml.replaceAll('#E63946', '#FF0000').replace(/Primary (station|route)/, '&lt;img src=x onerror="window.vectorUnsafe=true"&gt;'));
            assert(status.dataset.error === 'false' && legend.textContent.includes('<img') && !legend.querySelector('img') && !window.vectorUnsafe, 'Replacement and safe labels');
            r.labelsVisible = true; r.labelField = 'kind'; updateManagedLayerStyle(name);
            assert(r.layer.getStyleFunction()(features[0]).at(-1).getText().getText() === 'primary', 'Separate labels survive imported styling');
            assert(createManagedFeatureStyles(r, features[0], { isHighlighted: true })[0], 'Highlight style remains available');
            const runtime = getSymbologyRuntime(r);
            removeManagedLayer(name); item.remove();
            assert(!getLayerRecord(name) && !map.getLayers().getArray().includes(r.layer) && getSymbologyRuntime(r) !== runtime, 'Layer removal clears native runtime');
        }
        // A removed layer cannot receive an import whose file read is pending.
        const geojson = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }] };
        const features = new ol.format.GeoJSON().readFeatures(geojson), name = 'Pending import';
        const record = addVectorLayer(name, '#123456', geojson, features); addLayerItem(name, record.color, 1);
        const item = [...document.querySelectorAll('.layer-item')].find(node => node.dataset.layerName === name);
        const file = new File([pointXml], 'pending.sld'); let finish;
        file.text = () => new Promise(resolve => { finish = resolve; });
        const input = item.querySelector('.vector-sld-input'); Object.defineProperty(input, 'files', { value: [file] });
        input.dispatchEvent(new Event('change')); removeManagedLayer(name); item.remove(); finish(pointXml);
        await new Promise(resolve => setTimeout(resolve, 20));
        assert(!record.symbology, 'Pending removed-layer import does not mutate configuration');
        assert(!errors.length, `No browser event errors: ${errors.join('; ')}`);
    } finally { window.removeEventListener('error', onError); map.setTarget(null); mapHost.remove(); }
}
