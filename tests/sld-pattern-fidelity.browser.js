import ol from '/src/lib/ol.js';
import Polygon from 'ol/geom/Polygon.js';
import { toContext } from 'ol/render.js';
import { getPolygonPattern, getPolygonPatternDescriptor } from '/src/map/polygon-patterns.js';
import { applyImportedPolygonStyle, getPolygonLegendDescriptors } from '/src/map/polygon-symbology.js';
import { createManagedFeatureStyles } from '/src/map/style-factory.js';
import { renderPolygonLegendSymbol } from '/src/ui/polygon-legend-symbol.js';

export async function verifyPolygonPatternFidelity({ assert, parsed, bareTimes }) {
    // Official hatch parameters, with no dataset-specific styling or attributes.
    const hatch = { mark: 'hatch', size: 15, rotation: 0, opacity: 1,
        fill: { enabled: true, color: '#808080', opacity: 1 },
        stroke: { enabled: true, color: '#000000', width: 0.4, opacity: 1 } };
    const tile = getPolygonPattern(hatch);
    assert(tile.size === 15 && tile.canvas.width === 30, 'Official 15px hatch retains bounded supersampling');
    const alphaSum = resource => resource.canvas.getContext('2d').getImageData(0, 0, resource.canvas.width, resource.canvas.height)
        .data.reduce((sum, v, i) => sum + (i % 4 === 3 ? v : 0), 0);
    const thin = { ...hatch, fill: { ...hatch.fill, enabled: false }, stroke: { ...hatch.stroke, color: '#FF0000' } };
    const red = getPolygonPattern(thin);
    const rgba = red.canvas.getContext('2d').getImageData(0, 0, 30, 30).data;
    assert(rgba.some((v, i) => i % 4 === 3 && v > 0) && rgba.every((v, i) => ![1, 2].includes(i % 4) || v === 0), 'Mark stroke uses its own red color');
    assert(alphaSum(getPolygonPattern({ ...thin, stroke: { ...thin.stroke, width: 2 } })) > alphaSum(red) * 2, 'Stroke width changes coverage without changing tile dimensions');
    assert(getPolygonPattern({ ...hatch, rotation: 90 }).canvas.toDataURL() !== tile.canvas.toDataURL(), 'Positive hatch rotation changes orientation');
    const filledBare = { ...bareTimes, fill: { enabled: true, color: '#FF0000', opacity: 1 } };
    assert(alphaSum(getPolygonPattern(filledBare)) === 0, 'Even an explicit fill cannot resolve bare times');
    assert(alphaSum(getPolygonPattern({ ...filledBare, mark: 'shape://times' })) > 0, 'Prefixed times has visible strokes');
    const timesFillOnly = { ...filledBare, mark: 'shape://times', stroke: { ...filledBare.stroke, enabled: false } };
    assert(alphaSum(getPolygonPattern(timesFillOnly)) === 0, 'Open times lines have no fill area');

    // Real OL maps use independent renderer pixel ratios, as preview maps do.
    // A raw CanvasPattern fails the half-period assertion at pixelRatio 2.
    for (const mark of ['hatch', 'shape://times']) {
        const pattern = { ...hatch, mark };
        for (const pixelRatio of [1, 2]) {
            for (const resolution of [1, 4]) {
                const target = document.createElement('div');
                target.style.cssText = 'position:fixed;left:0;top:0;width:256px;height:128px';
                document.body.append(target);
                const feature = new ol.Feature(new Polygon([[[-2000, -2000], [2000, -2000], [2000, 2000], [-2000, 2000], [-2000, -2000]]]));
                const r = { isPolygonLayer: true, color: '#FFFFFF', opacity: 1, features: [feature] };
                const style = structuredClone(parsed); style.attribute = null; style.rules = [style.rules[0]];
                style.rules[0].symbolizers = [{ type: 'polygon', fill: { enabled: true, color: '#FFFFFF', opacity: 1, pattern }, stroke: { enabled: false } }];
                applyImportedPolygonStyle(r, style);
                const styles = createManagedFeatureStyles(r, feature);
                await Promise.all(styles.map(s => s.getFill()?.ready()));
                const map = new ol.Map({ target, pixelRatio, controls: [], layers: [new ol.layer.Vector({
                    source: new ol.source.Vector({ features: [feature] }), style: styles
                })], view: new ol.View({ center: [0, 0], resolution }) });
                try {
                    await new Promise(resolve => { map.once('rendercomplete', resolve); map.renderSync(); });
                    const canvas = target.querySelector('canvas');
                    const { data, width } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
                    const difference = offset => {
                        let sum = 0, count = 0;
                        for (let y = 24 * pixelRatio; y < 72 * pixelRatio; y++) {
                            for (let x = 32 * pixelRatio; x < 160 * pixelRatio; x++) {
                                sum += Math.abs(data[(y * width + x) * 4 + 3] - data[(y * width + x + offset) * 4 + 3]); count++;
                            }
                        }
                        return sum / count;
                    };
                    assert(difference(15 * pixelRatio) < 1, `${mark}: 15 CSS px repetition at DPR ${pixelRatio}, resolution ${resolution}`);
                    assert(difference(Math.round(7.5 * pixelRatio)) > 4, `${mark}: no doubled pattern density at DPR ${pixelRatio}, resolution ${resolution}`);
                } finally { map.dispose(); target.remove(); }
            }
        }
    }

    const feature = new ol.Feature(new Polygon([[[4, 5], [23, 2], [29, 17], [12, 22], [2, 16], [4, 5]]]));
    const r = { isPolygonLayer: true, color: '#FFFFFF', opacity: 0.5, features: [feature] };
    const style = structuredClone(parsed); style.attribute = null; style.rules = [style.rules[0]];
    style.rules[0].symbolizers = [{ type: 'polygon', fill: { color: '#FF0000', enabled: true, opacity: 1 },
        stroke: { color: '#0000FF', enabled: true, opacity: 1, width: 8 } }];
    applyImportedPolygonStyle(r, style);
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 24;
    const ctx = canvas.getContext('2d');
    const renderer = toContext(ctx, { pixelRatio: 1 });
    renderer.setStyle(createManagedFeatureStyles(r, feature)[0]); renderer.drawGeometry(feature.getGeometry());
    const container = document.createElement('div');
    renderPolygonLegendSymbol(container, getPolygonLegendDescriptors(r, 'alpha')[0].symbols);
    const svg = container.querySelector('svg'); svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
    await image.decode();
    const swatch = document.createElement('canvas'); swatch.width = 32; swatch.height = 24;
    const legendCtx = swatch.getContext('2d'); legendCtx.drawImage(image, 0, 0);
    const mapPixel = ctx.getImageData(20, 5, 1, 1).data, legendPixel = legendCtx.getImageData(20, 5, 1, 1).data;
    assert(Math.abs(mapPixel[3] - 192) <= 1 && mapPixel.every((v, i) => Math.abs(v - legendPixel[i]) <= 2), 'Map and SVG legend composite boundary over fill with the same per-paint alpha');
    style.rules[0].symbolizers[0].fill.pattern = hatch; applyImportedPolygonStyle(r, style);
    renderPolygonLegendSymbol(container, getPolygonLegendDescriptors(r, 'hatch')[0].symbols);
    assert(container.querySelector('pattern').getAttribute('width') === '15', 'Legend keeps 15px spacing rather than compressing to 12px');
    const source = decodeURIComponent(getPolygonPatternDescriptor(hatch).src.split(',')[1]);
    assert(source.includes(tile.dataUrl) && container.querySelector('image').getAttribute('href') === tile.dataUrl, 'Native OL descriptor and legend embed the same cached raster tile');
}
