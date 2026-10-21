import { Circle, Fill, RegularShape, Stroke, Style } from 'ol/style.js';
import { polygonPaintColor } from './polygon-patterns.js';

// One native compiler is used by the map and point legend raster previews.
export function createImportedVectorStyle(symbol, highlighted = false) {
    const stroke = symbol.stroke.enabled ? new Stroke({
        color: highlighted ? 'rgba(255, 223, 0, 0.9)' : polygonPaintColor(symbol.stroke.color,
            symbol.stroke.opacity * (symbol.type === 'point' ? 1 : symbol.opacity)),
        width: highlighted ? Math.max(symbol.stroke.width + 2, 4) : symbol.stroke.width,
        lineDash: symbol.stroke.dashArray, lineCap: symbol.stroke.lineCap, lineJoin: symbol.stroke.lineJoin,
        miterLimit: 10
    }) : null;
    if (symbol.type === 'line') return new Style({ stroke });
    const options = { fill: symbol.fill.enabled ? new Fill({ color: polygonPaintColor(symbol.fill.color, symbol.fill.opacity) }) : null,
        stroke, radius: symbol.size / 2, rotation: symbol.rotation * Math.PI / 180, rotateWithView: false };
    let image;
    if (symbol.shape === 'circle') image = new Circle(options);
    else {
        const shape = {
            square: { points: 4, angle: Math.PI / 4, radius: symbol.size / Math.SQRT2 },
            triangle: { points: 3 },
            star: { points: 5, radius2: symbol.size / 2 * (3 - Math.sqrt(5)) / 2 }
        }[symbol.shape];
        image = new RegularShape({ ...options, ...shape });
    }
    image.setOpacity(symbol.opacity);
    return new Style({ image });
}
