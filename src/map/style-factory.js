import { DEFAULT_STYLE_OPACITY } from '../config/constants.js';
import ol from '../lib/ol.js';

export function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function createFeatureStyle(color, opacity = DEFAULT_STYLE_OPACITY, isHighlight = false) {
    const fillColor = hexToRgba(color, opacity);
    const strokeColor = isHighlight ? 'rgba(255, 223, 0, 0.9)' : hexToRgba(color, opacity);
    const strokeWidth = isHighlight ? 4 : 2;

    return new ol.style.Style({
        fill: new ol.style.Fill({ color: fillColor }),
        stroke: new ol.style.Stroke({ color: strokeColor, width: strokeWidth }),
        image: new ol.style.Circle({
            radius: isHighlight ? 8 : 5,
            fill: new ol.style.Fill({ color: fillColor }),
            stroke: new ol.style.Stroke({ color: strokeColor, width: strokeWidth })
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

export function createManagedFeatureStyles(record, feature, options = {}) {
    const styles = [createFeatureStyle(record.color, record.opacity, options.isHighlighted)];
    const labelsEnabled = options.labelsEnabled ?? record.labelsVisible;

    if (labelsEnabled) {
        const labelText = getFeatureLabelText(feature, record.labelField);
        if (labelText) {
            styles.push(createLabelStyle(labelText));
        }
    }

    return styles;
}

export function createAnnotationStyle(feature) {
    const text = feature.get('text');
    const fontSize = feature.get('fontSize') || 12;
    const fontColor = feature.get('fontColor') || '#000000';
    const isSelected = feature.get('selected');

    return [
        new ol.style.Style({
            image: new ol.style.Circle({
                radius: isSelected ? 7 : 5,
                fill: new ol.style.Fill({ color: isSelected ? '#dc2626' : '#2563eb' }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
            })
        }),
        new ol.style.Style({
            text: new ol.style.Text({
                text,
                font: `bold ${fontSize}px Arial, sans-serif`,
                fill: new ol.style.Fill({ color: fontColor }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
                offsetY: -15
            })
        })
    ];
}
