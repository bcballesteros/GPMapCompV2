import { parseSld, SLD_LIMITS } from '/src/map/sld-importer.js';
import { getPolygonPattern, getPolygonPatternDescriptor, PATTERN_CACHE_LIMIT } from '/src/map/polygon-patterns.js';
import { verifyPolygonPatternFidelity } from '/tests/sld-pattern-fidelity.browser.js';
import { applyImportedPolygonStyle, getPolygonLegendDescriptors, invalidatePolygonSymbology,
    setPolygonCategoryColor, categoryKey } from '/src/map/polygon-symbology.js';
import { createManagedFeatureStyles } from '/src/map/style-factory.js';
import { updateManagedLayerStyle } from '/src/map/layer-manager.js';
import ol from '/src/lib/ol.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import { toContext } from 'ol/render.js';

export async function verifyAdvancedPolygonSld({ r, map, item, importFile, change, assert, reject }) {
    const xml = await (await fetch('/tests/fixtures/layered-polygon.sld')).text();
    const parsed = parseSld(xml);
    const hatch = parsed.rules[0].symbolizers[1].fill.pattern;
    const times = parsed.rules[1].symbolizers[1].fill.pattern;
    assert(hatch.mark === 'hatch' && hatch.size === 12 && hatch.rotation === 30 && hatch.opacity === 0.5, 'Pattern geometry and graphic opacity parsed');
    assert(hatch.stroke.color === '#112233' && hatch.stroke.width === 1.5 && hatch.stroke.opacity === 0.6 && hatch.fill.color === '#FF6600', 'Mark paints remain independent');
    const defaults = parseSld(xml.replace('<Size>12</Size><Rotation>30</Rotation>', '').replace('<Opacity>0.5</Opacity>', '')).rules[0].symbolizers[1].fill.pattern;
    assert(defaults.size === 16 && defaults.rotation === 0 && defaults.opacity === 1, 'Graphic defaults');
    assert(times.mark === 'shape://times', 'Explicit GeoTools times name retained');
    const bareTimes = parseSld(xml.replace('>shape://times<', '>times<')).rules[1].symbolizers[1].fill.pattern;
    assert(bareTimes.mark === 'times' && !getPolygonPattern(bareTimes).canvas.getContext('2d').getImageData(0, 0, 20, 20).data.some(v => v), 'Unresolved bare times contributes no paint');
    for (const [from, to, error] of [
        ['>hatch<', '>unknown<', /pattern mark/], ['>12<', '>0<', /Size/], ['>12<', '>129<', /Size/],
        ['>12<', '>Infinity<', /Size/], ['>30<', '>361<', /Rotation/], ['>30<', '>NaN<', /Rotation/],
        ['<Opacity>0.5', '<Opacity>-0.1', /Opacity/], ['>1.5<', '>17<', /stroke-width/],
        ['<Graphic><Mark>', '<Graphic><ExternalGraphic/><Mark>', /ExternalGraphic/],
        ['<Graphic><Mark>', '<Graphic><Mark/><Mark>', /Mark/],
        ['<Graphic><Mark>', '<Graphic><Size>10</Size><Size>20</Size><Mark>', /Size/],
        ['<FeatureTypeName>Feature', '<FeatureTypeName>restricted:Type', /FeatureTypeName/],
        ['<Size>12</Size>', '<Size><ogc:Literal>12</ogc:Literal></Size>', /Literal/]
    ]) reject(xml.replace(from, to), error);
    reject(xml.replace('<PolygonSymbolizer>', '<PolygonSymbolizer><Fill/></PolygonSymbolizer>'.repeat(SLD_LIMITS.symbolizersPerRule) + '<PolygonSymbolizer>'), /PolygonSymbolizer/);
    reject(xml.replace('<Mark><WellKnownName>hatch</WellKnownName>', '<Mark><WellKnownName>hatch</WellKnownName><Fill><GraphicFill><Graphic><Mark><WellKnownName>times</WellKnownName></Mark></Graphic></GraphicFill></Fill>'), /Fill|Nested/);
    const wrapper = content => `<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" version="1.0.0"><NamedLayer><UserStyle><FeatureTypeStyle>${content}</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`;
    const smallRule = '<Rule>' + '<PolygonSymbolizer><Fill/></PolygonSymbolizer>'.repeat(8) + '</Rule>';
    // Equality filters are required for multiple rules: add them to get as far as
    // total symbolizer/resource validation without unrelated matching failures.
    const filtered = (content, i) => content.replace('<Rule>', `<Rule><ogc:Filter xmlns:ogc="http://www.opengis.net/ogc"><ogc:PropertyIsEqualTo><ogc:PropertyName>kind</ogc:PropertyName><ogc:Literal>${i}</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>`);
    reject(wrapper(Array.from({ length: 251 }, (_, i) => filtered(smallRule, i)).join('')), /PolygonSymbolizer/);
    const expensiveRule = '<Rule><PolygonSymbolizer><Fill><GraphicFill><Graphic><Mark><WellKnownName>hatch</WellKnownName><Stroke/></Mark><Size>128</Size><Rotation>ANGLE</Rotation></Graphic></GraphicFill></Fill></PolygonSymbolizer></Rule>';
    reject(wrapper(Array.from({ length: 65 }, (_, i) => filtered(expensiveRule.replace('ANGLE', i), i)).join('')), /resource budget/);

    await importFile(xml);
    const legend = item.querySelector('.polygon-legend-entries');
    assert(legend.children.length === 2 && legend.children[0].textContent === 'Hatched water' && legend.children[1].textContent === 'Crossed forest', 'Pattern labels and original rule order');
    for (const row of legend.children) {
        assert(row.querySelectorAll('polygon').length === 2 && row.querySelector('pattern image').getAttribute('href').startsWith('data:image/png'), 'Layered legend uses shared raster pattern');
        assert(row.firstElementChild.getBoundingClientRect().width <= 32, 'Pattern swatch stays compact');
    }
    let styles = createManagedFeatureStyles(r, r.features[1]);
    assert(styles.length === 3 && styles[2].getText().getText() === 'Water', 'Labels follow both polygon paints');
    assert(styles[0].getFill().getColor() === 'rgba(175, 200, 225, 0.4)' && styles[1].getFill().getColor().src.startsWith('data:image/svg+xml'), 'Base is followed by native pattern descriptor, not overlay solid color');
    assert(styles[1].getStroke() === null, 'Omitted overlay outline stays absent');
    const compiled = styles[1], resource = getPolygonPattern(hatch, 0.4 * 0.8);
    assert(compiled.getFill().getColor() === getPolygonPatternDescriptor(hatch, 0.32) && getPolygonPattern(hatch, 0.32) === resource, 'Pattern tiles reused across features');
    assert(createManagedFeatureStyles(r, r.features[1])[1] === compiled, 'Ordered styles cached');
    const patternBefore = JSON.stringify(r.symbology.categories[0].symbolizers[1]);
    setPolygonCategoryColor(r, categoryKey('Water'), '#00FF00'); updateManagedLayerStyle('Example');
    styles = createManagedFeatureStyles(r, r.features[1]);
    assert(styles[0].getFill().getColor() === 'rgba(0, 255, 0, 0.4)' && JSON.stringify(r.symbology.categories[0].symbolizers[1]) === patternBefore, 'Category base edit preserves overlay');
    assert(styles[1] !== compiled && styles[1].getFill().getColor() === resource.descriptor, 'Style invalidates while unchanged tile is reused');
    const toggle = item.querySelector('.polygon-stroke-enabled'); toggle.checked = false; toggle.dispatchEvent(new Event('change'));
    styles = createManagedFeatureStyles(r, r.features[1]);
    assert(styles[0].getStroke() === null && styles[1].getFill().getColor() === resource.descriptor, 'Show Stroke disables boundaries while pattern strokes survive');
    assert([...legend.querySelectorAll('polygon')].every(p => p.getAttribute('stroke') === 'none'), 'Legend boundaries synchronized');
    assert(getPolygonLegendDescriptors(r, 'Example')[0].symbols[1].pattern.stroke.enabled, 'Legend preserves pattern stroke');
    change(item.querySelector('.transparency-slider'), '25', 'input');
    const faded = createManagedFeatureStyles(r, r.features[1])[1];
    assert(faded.getFill().getColor() === getPolygonPatternDescriptor(hatch, 0.25 * 0.8) && faded !== styles[1], 'Layer opacity changes invalidate effective pattern');
    const alpha = canvas => Math.max(...Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data).filter((_, i) => i % 4 === 3));
    const alphaFull = alpha(getPolygonPattern(hatch).canvas), alphaQuarter = alpha(getPolygonPattern(hatch, 0.25).canvas);
    assert(Math.abs(alphaQuarter - alphaFull * 0.25) <= 1, 'Layer alpha applied exactly once after mark composition');
    assert(getPolygonPattern(times).canvas.width === 20 && getPolygonPattern(hatch).canvas.width === 24, 'Size controls bounded tile dimensions');
    assert(getPolygonPattern({ ...hatch, rotation: 0 }).canvas.toDataURL() !== getPolygonPattern(hatch).canvas.toDataURL(), 'Rotation changes raster orientation');
    assert(getPolygonPattern({ ...hatch, stroke: { ...hatch.stroke, width: 0 } }).canvas.toDataURL() !== getPolygonPattern(hatch).canvas.toDataURL(), 'Mark fill and stroke contribute separately');
    const saved = JSON.stringify(r.symbology), savedStyles = createManagedFeatureStyles(r, r.features[1]);
    await importFile(xml.replace('>shape://times<', '>unsupported<'));
    assert(JSON.stringify(r.symbology) === saved && createManagedFeatureStyles(r, r.features[1])[1] === savedStyles[1], 'Late unsupported pattern rolls back entire import');
    change(item.querySelector('.polygon-style-mode'), 'single');
    assert(createManagedFeatureStyles(r, r.features[1]).length === 2 && !legend.querySelector('pattern'), 'Single mode removes imported overlays');
    change(item.querySelector('.polygon-style-mode'), 'categorized');
    assert(!legend.querySelector('pattern'), 'Generated palette has no stale patterns');
    change(item.querySelector('.polygon-style-mode'), 'imported');
    assert(JSON.stringify(r.symbology.categories[0].symbolizers[1]) === patternBefore && legend.querySelector('pattern'), 'Imported overlays restored');
    await importFile(xml.replace('>hatch<', '>shape://times<'));
    assert(createManagedFeatureStyles(r, r.features[1])[1].getFill().getColor() !== faded.getFill().getColor(), 'Replacement import recompiles pattern');

    // Native OL drawing checks holes, MultiPolygon islands and source-over order.
    const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 180;
    const ctx = canvas.getContext('2d');
    const feature = new ol.Feature(new MultiPolygon([
        [[[10, 10], [130, 10], [130, 130], [10, 130], [10, 10]], [[45, 45], [45, 95], [95, 95], [95, 45], [45, 45]]],
        [[[160, 10], [230, 10], [230, 130], [160, 130], [160, 10]]]
    ]));
    // Use OL's vector context to exercise native pattern clipping without UI size dependencies.
    const renderer = toContext(ctx, { pixelRatio: 1 });
    const symbolRecord = { isPolygonLayer: true, color: '#FFFFFF', opacity: 1, features: [feature] };
    const all = structuredClone(parsed); all.attribute = null; all.rules = [all.rules[1]];
    applyImportedPolygonStyle(symbolRecord, all);
    const draw = async () => {
        const styles = createManagedFeatureStyles(symbolRecord, feature);
        await Promise.all(styles.map(style => style.getFill()?.ready()));
        ctx.clearRect(0, 0, 240, 180);
        for (const style of styles) { renderer.setStyle(style); renderer.drawGeometry(feature.getGeometry()); }
    };
    await draw();
    const gallery = document.createElement('div');
    gallery.style.cssText = 'position:fixed;left:285px;top:420px;display:flex;gap:16px;z-index:2;background:white;padding:8px';
    document.body.append(gallery);
    const showRaster = label => {
        const figure = document.createElement('figure'); figure.style.margin = '0';
        const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
        copy.getContext('2d').drawImage(canvas, 0, 0);
        const caption = document.createElement('figcaption'); caption.textContent = label;
        figure.append(copy, caption); gallery.append(figure);
    };
    showRaster('Times: MultiPolygon and hole');
    const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    assert(pixel(70, 70)[3] === 0 && pixel(145, 70)[3] === 0, 'Holes and gap between MultiPolygon islands remain transparent');
    const pixels = ctx.getImageData(15, 15, 100, 20).data;
    let base = 0, ink = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] === 255 && pixels[i + 1] === 255 && pixels[i + 2] === 0) base++;
        if (pixels[i + 2] > 50 && pixels[i] < 200) ink++;
    }
    assert(base > 500 && ink > 50 && pixel(195, 70)[3] > 0, 'Times ink and visible base fill render inside both islands');
    feature.setGeometry(new Polygon(feature.getGeometry().getCoordinates()[0])); await draw();
    assert(pixel(70, 70)[3] === 0 && pixel(195, 70)[3] === 0, 'Polygon also clips hole and exterior');
    all.rules[0] = structuredClone(parsed.rules[0]); applyImportedPolygonStyle(symbolRecord, all); await draw();
    showRaster('Rotated hatch: Polygon and hole');
    assert(pixel(70, 70)[3] === 0 && ctx.getImageData(15, 15, 100, 20).data.some((v, i) => i % 4 === 0 && v !== 175 && v > 0), 'Hatch paints polygon interior while preserving hole');
    // A later solid symbol really covers prior paints; reversing changes pixels.
    const ordered = structuredClone(all);
    ordered.rules[0].symbolizers.push({ type: 'polygon', fill: { color: '#FF00FF', enabled: true, opacity: 1 }, stroke: { enabled: false } });
    applyImportedPolygonStyle(symbolRecord, ordered); await draw();
    assert(pixel(20, 20).join() === '255,0,255,255', 'Third symbolizer paints on top in order');
    ordered.rules[0].symbolizers.reverse(); applyImportedPolygonStyle(symbolRecord, ordered); await draw();
    assert(pixel(20, 20).join() !== '255,0,255,255', 'Reversing symbolizers changes draw order');
    await verifyPolygonPatternFidelity({ assert, parsed, bareTimes });
    const first = getPolygonPattern(times);
    for (let i = 0; i <= PATTERN_CACHE_LIMIT; i++) getPolygonPattern({ ...times, rotation: i });
    assert(getPolygonPattern(times) !== first, 'Bounded LRU releases obsolete entries');
    assert(getPolygonPattern(times) === getPolygonPattern(times), 'Active tile is reused after eviction');

    const officialResponse = await fetch('/__sld_official_reference');
    if (officialResponse.ok) {
        const official = parseSld(await officialResponse.text());
        assert(official.rules.length > 0, 'Full supplied reference parsed');
        const referenceFeatures = official.rules.map(rule => new ol.Feature({ [official.attribute]: rule.literal, geometry: feature.getGeometry().clone() }));
        const referenceRecord = { isPolygonLayer: true, color: '#FFFFFF', opacity: 1, features: referenceFeatures };
        const report = applyImportedPolygonStyle(referenceRecord, official);
        for (const [i, f] of referenceFeatures.entries()) assert(createManagedFeatureStyles(referenceRecord, f).length === official.rules[i].symbolizers.length, 'Every official category compiles all ordered paints');
        console.info('Official reference', report);
        assert(report.matchedFeatures === official.rules.length && !report.unmatchedRules, 'Complete reference imported against synthetic matching data');
        window.officialSldReport = { ...report, symbolizerCount: official.rules.reduce((sum, rule) => sum + rule.symbolizers.length, 0) };
        // Representative swatches for human visual comparison; no dataset retained.
        const { renderPolygonLegendSymbol } = await import('/src/ui/polygon-legend-symbol.js');
        const panel = document.createElement('div'); panel.id = 'official-reference-review';
        for (const descriptor of getPolygonLegendDescriptors(referenceRecord, 'Reference').filter(d => d.symbols.some(s => s.pattern))) {
            const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '8px';
            const swatch = document.createElement('span'); swatch.className = 'polygon-legend-symbol';
            renderPolygonLegendSymbol(swatch, descriptor.symbols); row.append(swatch, document.createTextNode(descriptor.label)); panel.append(row);
        }
        document.body.append(panel);
    }
    // Actual managed map and a preview clone share the same cached resources.
    const preview = new ol.layer.Vector({ source: r.source, style: r.layer.getStyle() });
    assert(preview.getStyleFunction()(r.features[1])[1] === r.layer.getStyleFunction()(r.features[1])[1], 'Preview clone shares compiled pattern styles');
    r.layer.setVisible(false); map.renderSync(); r.layer.setVisible(true);
    map.getView().setZoom(map.getView().getZoom() + 1); map.getView().setCenter([2.1, 0.5]); map.renderSync();
    invalidatePolygonSymbology(r);
    // Keep the real managed map visible in the optional verification capture.
    await importFile(xml);
    change(item.querySelector('.transparency-slider'), '100', 'input');
    r.labelsVisible = false;
    map.getTargetElement().style.cssText = 'position:fixed;left:285px;top:20px;width:650px;height:360px;z-index:2;background:white';
    map.updateSize();
    map.getView().fit([0, 0, 1.8, 0.8], { padding: [20, 20, 20, 20] });
    await new Promise(resolve => { map.once('rendercomplete', resolve); map.renderSync(); });
    const mapCanvas = map.getViewport().querySelector('canvas');
    const mapPixels = mapCanvas.getContext('2d').getImageData(0, 0, mapCanvas.width, mapCanvas.height).data;
    let yellow = 0, blue = 0, patternInk = 0;
    for (let i = 0; i < mapPixels.length; i += 4) {
        if (mapPixels[i] === 255 && mapPixels[i + 1] === 255 && mapPixels[i + 2] === 0) yellow++;
        if (mapPixels[i] === 175 && mapPixels[i + 1] === 200 && mapPixels[i + 2] === 225) blue++;
        if (mapPixels[i] < 100 && mapPixels[i + 1] < 100 && mapPixels[i + 2] > 100 && mapPixels[i + 3] > 0) patternInk++;
    }
    assert(yellow > 500 && blue > 500 && patternInk > 100, 'Managed map canvas visibly contains both base fills and times pattern ink');
    console.info('Advanced polygon SLD checks passed');
}
