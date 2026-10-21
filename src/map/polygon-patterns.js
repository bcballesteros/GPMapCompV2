// Runtime resources only; authoritative symbology contains plain pattern data.
// A bounded LRU shares tiles between categories, the map, previews and legends.
export const PATTERN_CACHE_LIMIT = 128;
const resources = new Map();

export function polygonPaintColor(hex, opacity = 1) {
    const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function markPath(context, mark) {
    context.beginPath();
    if (mark === 'shape://times') {
        context.moveTo(-0.5, -0.5); context.lineTo(0.5, 0.5);
        context.moveTo(-0.5, 0.5); context.lineTo(0.5, -0.5);
    } else if (mark === 'hatch') {
        // GeoTools hatch is a narrow diagonal band with corner fragments,
        // not a zero-area line. Its Fill and Stroke both contribute to the mark.
        for (const points of [
            [[0.55, 0.57], [0.52, 0.57], [-0.57, -0.52], [-0.57, -0.57], [-0.52, -0.57], [0.57, 0.52], [0.57, 0.57]],
            [[0.57, -0.49], [0.49, -0.57], [0.57, -0.57], [0.57, -0.49]],
            [[-0.57, 0.5], [-0.5, 0.57], [-0.57, 0.57], [-0.57, 0.5]]
        ]) {
            context.moveTo(...points[0]);
            for (const point of points.slice(1)) context.lineTo(...point);
            // The GeoTools path is open; fill closes it implicitly, stroke does not.
        }
    }
}

export function getPolygonPattern(pattern, opacity = 1) {
    // Defense in depth for restored configuration; parsed SLD has stricter checks.
    if (!['hatch', 'times', 'shape://times'].includes(pattern.mark) || !Number.isFinite(pattern.size) || pattern.size < 1 || pattern.size > 128
        || !Number.isFinite(pattern.rotation) || Math.abs(pattern.rotation) > 360
        || !Number.isFinite(pattern.opacity) || pattern.opacity < 0 || pattern.opacity > 1
        || !Number.isFinite(opacity) || opacity < 0 || opacity > 1
        || ![pattern.fill, pattern.stroke].every(paint => paint && /^#[\da-f]{6}$/i.test(paint.color)
            && Number.isFinite(paint.opacity) && paint.opacity >= 0 && paint.opacity <= 1)
        || !Number.isFinite(pattern.stroke.width) || pattern.stroke.width < 0 || pattern.stroke.width > 16) throw new Error('Invalid polygon pattern configuration.');
    opacity = Number(opacity.toFixed(8));
    const key = JSON.stringify([pattern, opacity]);
    let resource = resources.get(key);
    if (resource) {
        resources.delete(key); resources.set(key, resource);
        return resource;
    }
    const canvas = document.createElement('canvas');
    // Two samples per CSS pixel, bounded to 256 x 256 regardless of display DPR.
    canvas.width = canvas.height = Math.ceil(pattern.size * 2);
    const ctx = canvas.getContext('2d');
    const size = pattern.size;
    ctx.scale(canvas.width / size, canvas.height / size);
    // Neighboring copies wrap rotated marks and their strokes across tile edges.
    // Bounds (size >= 1, width <= 16) determine a finite, bounded copy count.
    const strokeWidth = pattern.stroke.enabled ? pattern.stroke.width : 0;
    const reach = Math.ceil(1 + strokeWidth / (2 * size));
    for (let y = -reach; y <= reach; y++) {
        for (let x = -reach; x <= reach; x++) {
            ctx.save();
            ctx.translate((x + 0.5) * size, (y + 0.5) * size);
            ctx.rotate(pattern.rotation * Math.PI / 180);
            ctx.scale(size, -size); // SLD marks use a Cartesian y axis.
            markPath(ctx, pattern.mark);
            if (pattern.fill.enabled && pattern.mark === 'hatch') {
                ctx.fillStyle = polygonPaintColor(pattern.fill.color, pattern.fill.opacity);
                ctx.fill('evenodd');
            }
            if (pattern.stroke.enabled && strokeWidth > 0) {
                ctx.strokeStyle = polygonPaintColor(pattern.stroke.color, pattern.stroke.opacity);
                ctx.lineWidth = strokeWidth / size;
                ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
                ctx.stroke();
            }
            ctx.restore();
        }
    }
    // Apply graphic/fill/layer alpha once to the composited mark tile. Mark
    // paint alpha has already been applied independently above.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = `rgba(0, 0, 0, ${pattern.opacity * opacity})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const paint = ctx.createPattern(canvas, 'repeat');
    paint.setTransform(new DOMMatrix().scale(size / canvas.width));
    resource = { canvas, paint, size, dataUrl: null };
    resources.set(key, resource);
    if (resources.size > PATTERN_CACHE_LIMIT) resources.delete(resources.keys().next().value);
    return resource;
}

// Native OL pattern descriptors scale with the renderer's pixel ratio. Raw
// CanvasPatterns do not (OL 10.6), making a 15px tile only 7.5 CSS px at DPR 2.
// The SVG only supplies logical image dimensions around the shared raster;
// OpenLayers handles loading, repetition, clipping and preview/export DPR.
export function getPolygonPatternDescriptor(pattern, opacity = 1) {
    const resource = getPolygonPattern(pattern, opacity);
    if (!resource.descriptor) {
        resource.dataUrl ||= resource.canvas.toDataURL();
        const size = Math.max(1, Math.round(resource.size));
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${resource.canvas.width} ${resource.canvas.height}"><image width="${resource.canvas.width}" height="${resource.canvas.height}" href="${resource.dataUrl}"/></svg>`;
        resource.descriptor = { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
    }
    return resource.descriptor;
}
