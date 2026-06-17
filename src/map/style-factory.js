import { DEFAULT_LINE_STROKE_WIDTH, DEFAULT_POINT_SIZE, DEFAULT_STYLE_OPACITY, DEFAULT_SVG_BASE_SIZE, DEFAULT_SVG_BASE_SCALE } from '../config/constants.js';
import ol from '../lib/ol.js';

/**
 * Generates preset marker shapes as SVG data URLs
 */
export const PRESET_MARKERS = {
    circle: 'circle',
    square: 'square',
    star: 'star',
    triangle: 'triangle',
    diamond: 'diamond'
};

export function generatePresetMarkerSvg(markerType, fillColor = '#2563eb', strokeColor = '#1e40af', strokeWidth = 1) {
    const size = 24;
    const svgNS = 'http://www.w3.org/2000/svg';
    let pathData = '';
    const hasStroke = strokeColor && Number.isFinite(strokeWidth) && strokeWidth > 0;
    const strokeAttrs = hasStroke ? ` stroke="${strokeColor}" stroke-width="${strokeWidth}"` : '';

    switch (markerType) {
        case PRESET_MARKERS.circle:
            pathData = `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2.5}" fill="${fillColor}"${strokeAttrs}/>`;
            break;
        case PRESET_MARKERS.square:
            pathData = `<rect x="${size / 4.5}" y="${size / 4.5}" width="${size / 2.25}" height="${size / 2.25}" fill="${fillColor}"${strokeAttrs}/>`;
            break;
        case PRESET_MARKERS.star:
            // 5-pointed star
            const cx = size / 2;
            const cy = size / 2;
            const outerR = size / 2.3;
            const innerR = size / 5.5;
            let points = '';
            for (let i = 0; i < 10; i++) {
                const angle = (i * Math.PI) / 5 - Math.PI / 2;
                const r = i % 2 === 0 ? outerR : innerR;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                points += `${x},${y} `;
            }
            pathData = `<polygon points="${points}" fill="${fillColor}"${strokeAttrs}/>`;
            break;
        case PRESET_MARKERS.triangle:
            const h = size / 2.2;
            const base = size / 2;
            pathData = `<polygon points="${size / 2},${size / 6} ${size / 2 + base / 2},${size - size / 6} ${size / 2 - base / 2},${size - size / 6}" fill="${fillColor}"${strokeAttrs}/>`;
            break;
        case PRESET_MARKERS.diamond:
            pathData = `<polygon points="${size / 2},${size / 6} ${size - size / 6},${size / 2} ${size / 2},${size - size / 6} ${size / 6},${size / 2}" fill="${fillColor}"${strokeAttrs}/>`;
            break;
        default:
            // Default to circle if unknown type
            pathData = `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2.5}" fill="${fillColor}"${strokeAttrs}/>`;
    }

    const svg = `<svg xmlns="${svgNS}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">${pathData}</svg>`;
    const encoded = encodeURIComponent(svg)
        .replace(/%20/g, ' ')
        .replace(/%3D/g, '=')
        .replace(/%3A/g, ':')
        .replace(/%2F/g, '/')
        .replace(/%22/g, '"')
        .replace(/%2C/g, ',')
        .replace(/%3B/g, ';')
        .replace(/%28/g, '(')
        .replace(/%29/g, ')')
        .replace(/%23/g, '%23');

    return `data:image/svg+xml;utf8,${encoded}`;
}

export function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function createFeatureStyle(
    color,
    opacity = DEFAULT_STYLE_OPACITY,
    isHighlight = false,
    pointSize = DEFAULT_POINT_SIZE,
    strokeWidth = DEFAULT_LINE_STROKE_WIDTH,
    options = {}
) {
    const fillHex = options.fillColor || color;
    const strokeHex = options.strokeColor || color;
    const fillColor = hexToRgba(fillHex, opacity);
    const strokeColor = isHighlight ? 'rgba(255, 223, 0, 0.9)' : hexToRgba(strokeHex, opacity);
    const safeStrokeWidth = Number.isFinite(strokeWidth) ? strokeWidth : DEFAULT_LINE_STROKE_WIDTH;
    const renderedStrokeWidth = isHighlight ? Math.max(safeStrokeWidth + 2, 4) : safeStrokeWidth;
    const safePointSize = Number.isFinite(pointSize) ? pointSize : DEFAULT_POINT_SIZE;

    return new ol.style.Style({
        fill: new ol.style.Fill({ color: fillColor }),
        stroke: new ol.style.Stroke({ color: strokeColor, width: renderedStrokeWidth }),
        image: new ol.style.Circle({
            radius: isHighlight ? Math.max(safePointSize + 3, 8) : safePointSize,
            fill: new ol.style.Fill({ color: fillColor }),
            stroke: new ol.style.Stroke({ color: strokeColor, width: renderedStrokeWidth })
        })
    });
}

export function createLabelStyle(text) {
    return new ol.style.Style({
        text: new ol.style.Text({
            text,
            font: '12px Arial, sans-serif',
            fill: new ol.style.Fill({ color: '#000' }),
            stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
            offsetY: -15
        })
    });
}

export function pickDefaultLabelField(features = []) {
    const candidateCounts = new Map();

    features.forEach((feature) => {
        const properties = feature?.getProperties?.() || feature?.properties || {};
        Object.entries(properties).forEach(([key, value]) => {
            if (key === 'geometry' || value === null || value === undefined) {
                return;
            }

            const normalizedValue = typeof value === 'string' ? value.trim() : value;
            if (normalizedValue === '') {
                return;
            }

            const isSupportedType = ['string', 'number', 'boolean'].includes(typeof normalizedValue);
            if (!isSupportedType) {
                return;
            }

            const score = candidateCounts.get(key) || 0;
            const bonus = typeof normalizedValue === 'string' ? 2 : 1;
            candidateCounts.set(key, score + bonus);
        });
    });

    const rankedCandidates = Array.from(candidateCounts.entries()).sort((left, right) => right[1] - left[1]);
    return rankedCandidates[0]?.[0] || null;
}

export function getFeatureLabelText(feature, labelField) {
    if (!feature || !labelField) {
        return '';
    }

    const value = feature.get(labelField);
    if (value === null || value === undefined) {
        return '';
    }

    const text = String(value).trim();
    return text.length > 0 ? text : '';
}

function normalizeSvgText(svgText, basePx) {
    const svgTagMatch = svgText.match(/<svg\b([^>]*)>/i);
    if (!svgTagMatch) {
        return svgText;
    }

    let svgAttrs = svgTagMatch[1] || '';
    const hasViewBox = /\bviewBox=["']([^"']+)["']/.test(svgAttrs);
    const widthMatch = /\bwidth=["']([^"']+)["']/.exec(svgAttrs);
    const heightMatch = /\bheight=["']([^"']+)["']/.exec(svgAttrs);

    const parsedWidth = widthMatch ? parseFloat(widthMatch[1]) : NaN;
    const parsedHeight = heightMatch ? parseFloat(heightMatch[1]) : NaN;

    if (!hasViewBox && Number.isFinite(parsedWidth) && Number.isFinite(parsedHeight)) {
        svgAttrs = svgAttrs.replace(/\bviewBox=["'][^"']+["']/, '');
        svgAttrs += ` viewBox="0 0 ${parsedWidth} ${parsedHeight}"`;
    }

    if (widthMatch) {
        svgAttrs = svgAttrs.replace(/\bwidth=["'][^"']+["']/, `width="${basePx}"`);
    } else {
        svgAttrs += ` width="${basePx}"`;
    }

    if (heightMatch) {
        svgAttrs = svgAttrs.replace(/\bheight=["'][^"']+["']/, `height="${basePx}"`);
    } else {
        svgAttrs += ` height="${basePx}"`;
    }

    if (!/\bpreserveAspectRatio=/.test(svgAttrs)) {
        svgAttrs += ' preserveAspectRatio="xMidYMid meet"';
    }

    return svgText.replace(/<svg\b[^>]*>/i, `<svg${svgAttrs}>`);
}

function normalizeSvgDataUrl(src, basePx) {
    if (typeof src !== 'string') {
        return src;
    }

    const headerMatch = src.match(/^(data:image\/svg\+xml(?:;charset=[^;]+)?(?:;base64)?),/i);
    if (!headerMatch) {
        return src;
    }

    const header = headerMatch[1];
    const data = src.slice(header.length + 1);
    let svgText = data;

    if (/;base64$/i.test(header)) {
        try {
            svgText = atob(data);
        } catch (error) {
            return src;
        }
    } else {
        try {
            svgText = decodeURIComponent(data);
        } catch (error) {
            svgText = data;
        }
    }

    const normalizedSvg = normalizeSvgText(svgText, basePx);
    const encodedSvg = encodeURIComponent(normalizedSvg)
        .replace(/%20/g, ' ')
        .replace(/%3D/g, '=')
        .replace(/%3A/g, ':')
        .replace(/%2F/g, '/')
        .replace(/%22/g, '"')
        .replace(/%2C/g, ',')
        .replace(/%3B/g, ';')
        .replace(/%28/g, '(')
        .replace(/%29/g, ')')
        .replace(/%23/g, '%23');

    return `data:image/svg+xml;utf8,${encodedSvg}`;
}

function applyStrokeToSvgDataUrl(src, strokeColor, strokeWidth, basePx) {
    if (!strokeColor || !Number.isFinite(strokeWidth) || strokeWidth <= 0) {
        return normalizeSvgDataUrl(src, basePx);
    }

    const headerMatch = src.match(/^(data:image\/svg\+xml(?:;charset=[^;]+)?(?:;base64)?),/i);
    if (!headerMatch) {
        return normalizeSvgDataUrl(src, basePx);
    }

    const header = headerMatch[1];
    const data = src.slice(header.length + 1);
    let svgText = data;

    if (/;base64$/i.test(header)) {
        try {
            svgText = atob(data);
        } catch (e) {
            return normalizeSvgDataUrl(src, basePx);
        }
    } else {
        try {
            svgText = decodeURIComponent(data);
        } catch (e) {
            svgText = data;
        }
    }

    let normalized = normalizeSvgText(svgText, basePx);

    // inject or replace stroke attrs on the root svg tag
    normalized = normalized.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
        const hasStroke = /\bstroke\s*=/.test(attrs);
        const hasStrokeWidth = /\bstroke-width\s*=/.test(attrs);
        let newAttrs = attrs;
        if (hasStroke) {
            newAttrs = newAttrs.replace(/\bstroke\s*=\"[^\"]*\"/, `stroke=\"${strokeColor}\"`);
        } else {
            newAttrs += ` stroke=\"${strokeColor}\"`;
        }
        if (hasStrokeWidth) {
            newAttrs = newAttrs.replace(/\bstroke-width\s*=\"[^\"]*\"/, `stroke-width=\"${strokeWidth}\"`);
        } else {
            newAttrs += ` stroke-width=\"${strokeWidth}\"`;
        }
        return `<svg${newAttrs}>`;
    });

    const encodedSvg = encodeURIComponent(normalized)
        .replace(/%20/g, ' ')
        .replace(/%3D/g, '=')
        .replace(/%3A/g, ':')
        .replace(/%2F/g, '/')
        .replace(/%22/g, '"')
        .replace(/%2C/g, ',')
        .replace(/%3B/g, ';')
        .replace(/%28/g, '(')
        .replace(/%29/g, ')')
        .replace(/%23/g, '%23');

    return `data:image/svg+xml;utf8,${encodedSvg}`;
}

export function createManagedFeatureStyles(record, feature, options = {}) {
    const labelsEnabled = options.labelsEnabled ?? record.labelsVisible;
    const styles = [];

    if (record.isPointLayer) {
        // Priority: preset marker > uploaded SVG > default circle style
        if (record.markerPresetType) {
            // Generate preset marker with stroke styling
            const strokeColor = record.markerStrokeEnabled ? record.markerStrokeColor : null;
            const strokeWidth = record.markerStrokeEnabled ? record.markerStrokeWidth : 0;
            const markerSvg = generatePresetMarkerSvg(record.markerPresetType, record.color, strokeColor, strokeWidth);
            styles.push(createPointIconStyle(markerSvg, record.pointSize, record.opacity));
        } else if (record.svgMarkerDataUrl) {
            // Uploaded SVGs MUST NEVER have stroke applied.
            // Always normalize the SVG data URL and ignore any marker stroke settings.
            const basePx = DEFAULT_SVG_BASE_SIZE || 24;
            const src = normalizeSvgDataUrl(record.svgMarkerDataUrl, basePx);
            styles.push(createPointIconStyle(src, record.pointSize, record.opacity));
        } else {
            // Default circle point style: apply marker stroke settings when enabled
            const strokeWidth = record.markerStrokeEnabled ? record.markerStrokeWidth : 0;
            const colorOptions = record.markerStrokeEnabled
                ? { strokeColor: record.markerStrokeColor }
                : {};

            styles.push(createFeatureStyle(
                record.color,
                record.opacity,
                options.isHighlighted,
                record.pointSize,
                strokeWidth,
                colorOptions
            ));
        }
    } else {
        const strokeWidth = record.isPolygonLayer
            ? record.polygonStrokeWidth
            : record.lineStrokeWidth;
        const colorOptions = record.isPolygonLayer
            ? {
                fillColor: record.polygonFillColor || record.color,
                strokeColor: record.polygonStrokeColor || record.color
            }
            : {};

        styles.push(createFeatureStyle(
            record.color,
            record.opacity,
            options.isHighlighted,
            record.pointSize,
            strokeWidth,
            colorOptions
        ));
    }

    if (labelsEnabled) {
        const labelText = getFeatureLabelText(feature, record.labelField);
        if (labelText) {
            styles.push(createLabelStyle(labelText));
        }
    }

    return styles;
}

export function createPointIconStyle(src, pointSize = DEFAULT_POINT_SIZE, opacity = DEFAULT_STYLE_OPACITY) {
    // Normalize SVG rendering by providing a fixed base img size and
    // applying a strict small default baseline scale. The point size slider
    // is a relative multiplier from this baseline, so raw SVG dimensions
    // are ignored and icon size is governed by OpenLayers Icon scale only.
    const basePx = DEFAULT_SVG_BASE_SIZE || 24;
    const baseScale = Number.isFinite(DEFAULT_SVG_BASE_SCALE) ? DEFAULT_SVG_BASE_SCALE : 0.2;
    const normalizedPointSize = Number.isFinite(pointSize) ? pointSize : DEFAULT_POINT_SIZE;
    const relativeSize = normalizedPointSize / DEFAULT_POINT_SIZE;
    const scale = Math.max(0.05, baseScale * relativeSize);
    const normalizedSrc = normalizeSvgDataUrl(src, basePx);

    return new ol.style.Style({
        image: new ol.style.Icon({
            src: normalizedSrc,
            imgSize: [basePx, basePx],
            scale,
            anchor: [0.5, 0.5],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            opacity,
            crossOrigin: 'anonymous'
        })
    });
}

export function createAnnotationStyle(feature) {
    const text = feature.get('text');
    const fontSize = feature.get('fontSize') || 12;
    const fontColor = feature.get('fontColor') || '#000000';
    const isSelected = feature.get('selected');
    const isVisible = feature.get('annotationVisible') !== false;
    const markerColor = isSelected ? '#dc2626' : isVisible ? '#2563eb' : '#64748b';

    const styles = [
        new ol.style.Style({
            image: new ol.style.Circle({
                radius: isSelected ? 7 : isVisible ? 5 : 4,
                fill: new ol.style.Fill({ color: markerColor }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
            })
        })
    ];

    if (isVisible) {
        styles.push(new ol.style.Style({
            text: new ol.style.Text({
                text,
                font: `bold ${fontSize}px Arial, sans-serif`,
                fill: new ol.style.Fill({ color: fontColor }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
                offsetY: -15
            })
        }));
    }

    return styles;
}
