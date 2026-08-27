import ol from '../lib/ol.js';
import { getMap } from '../state/store.js';
import { getFeatureSavingCollections, restoreFeatureSavingCollections } from '../tools/annotation-tool.js';

export const FEATURE_SAVE_FORMAT = 'GPMapCompV2.FeatureSave';
export const FEATURE_SAVE_APPLICATION = 'GPMapCompV2';
export const FEATURE_SAVE_SCHEMA_VERSION = 1;
export const FEATURE_SAVE_GEOMETRY_PROJECTION = 'EPSG:4326';

const DRAWING_GEOMETRIES = {
    point: 'Point',
    line: 'LineString',
    polygon: 'Polygon',
    freehand: 'LineString'
};

const MEASUREMENT_GEOMETRIES = {
    distance: 'LineString',
    area: 'Polygon'
};

function createPersistenceId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }

    return `feature-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getFeatureId(feature) {
    let id = feature.get('gpmapPersistenceId');
    if (!id) {
        id = createPersistenceId();
        feature.set('gpmapPersistenceId', id);
    }
    return id;
}

function getMapProjectionCode() {
    return getMap()?.getView?.()?.getProjection?.()?.getCode?.() || 'EPSG:3857';
}

function geometryToGeoJson(geometry) {
    return new ol.format.GeoJSON().writeGeometryObject(geometry, {
        dataProjection: FEATURE_SAVE_GEOMETRY_PROJECTION,
        featureProjection: getMapProjectionCode()
    });
}

function makeSavableItem(category, feature, type) {
    return {
        id: getFeatureId(feature),
        category,
        type,
        feature
    };
}

/**
 * Lists individual items for a future save picker. `feature` is the live
 * OpenLayers feature; it is supplied for display/selection only, never placed
 * in the JSON save document.
 */
export function getSavableFeatureItems() {
    const collections = getFeatureSavingCollections();
    return [
        ...collections.annotations.map((feature) => makeSavableItem('annotations', feature, 'text')),
        ...collections.drawings.map((feature) => makeSavableItem('drawings', feature, feature.get('drawingType'))),
        ...collections.measurements.map((feature) => makeSavableItem('measurements', feature, feature.get('measurementType')))
    ];
}

function selectedItemIds(selection) {
    if (!selection) {
        return null;
    }

    if (selection instanceof Set) {
        return selection;
    }

    if (Array.isArray(selection)) {
        return new Set(selection.map((entry) => typeof entry === 'string' ? entry : entry?.id).filter(Boolean));
    }

    if (selection.itemIds instanceof Set) {
        return selection.itemIds;
    }

    if (Array.isArray(selection.itemIds)) {
        return new Set(selection.itemIds);
    }

    return null;
}

function serializeAnnotation(item) {
    const feature = item.feature;
    return {
        id: item.id,
        type: 'text',
        geometry: geometryToGeoJson(feature.getGeometry()),
        properties: {
            text: feature.get('text'),
            fontSize: feature.get('fontSize') || 12,
            fontColor: feature.get('fontColor') || '#000000',
            labelVisible: feature.get('annotationLabelHidden') !== true,
            pointVisible: feature.get('annotationPointVisible') !== false
        }
    };
}

function serializeSimpleFeature(item) {
    return {
        id: item.id,
        type: item.type,
        geometry: geometryToGeoJson(item.feature.getGeometry())
    };
}

/** Creates a versioned, portable save document. Pass `{ itemIds }` (or an
 * array/Set of item ids) to include only a future UI's selected items. */
export function createFeatureSaveDocument(selection = null) {
    const includedIds = selectedItemIds(selection);
    const items = getSavableFeatureItems().filter((item) => !includedIds || includedIds.has(item.id));

    return {
        format: FEATURE_SAVE_FORMAT,
        application: FEATURE_SAVE_APPLICATION,
        schemaVersion: FEATURE_SAVE_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        geometryProjection: FEATURE_SAVE_GEOMETRY_PROJECTION,
        annotations: items.filter((item) => item.category === 'annotations').map(serializeAnnotation),
        drawings: items.filter((item) => item.category === 'drawings').map(serializeSimpleFeature),
        measurements: items.filter((item) => item.category === 'measurements').map(serializeSimpleFeature)
    };
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fail(message) {
    throw new Error(message);
}

function validateCoordinate(coordinate, path) {
    if (!Array.isArray(coordinate) || coordinate.length < 2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) {
        fail(`${path} must be a finite coordinate.`);
    }
    if (coordinate[0] < -180 || coordinate[0] > 180 || coordinate[1] < -90 || coordinate[1] > 90) {
        fail(`${path} is outside the EPSG:4326 coordinate range.`);
    }
}

function sameCoordinate(first, second) {
    return first[0] === second[0] && first[1] === second[1];
}

function validateGeometry(geometry, expectedType, path) {
    if (!isPlainObject(geometry) || geometry.type !== expectedType) {
        fail(`${path} must be a ${expectedType} GeoJSON geometry.`);
    }

    const { coordinates } = geometry;
    if (expectedType === 'Point') {
        validateCoordinate(coordinates, `${path}.coordinates`);
        return;
    }

    if (expectedType === 'LineString') {
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
            fail(`${path}.coordinates must contain at least two positions.`);
        }
        coordinates.forEach((coordinate, index) => validateCoordinate(coordinate, `${path}.coordinates[${index}]`));
        return;
    }

    if (!Array.isArray(coordinates) || coordinates.length === 0) {
        fail(`${path}.coordinates must contain at least one linear ring.`);
    }
    coordinates.forEach((ring, ringIndex) => {
        if (!Array.isArray(ring) || ring.length < 4) {
            fail(`${path}.coordinates[${ringIndex}] must contain at least four positions.`);
        }
        ring.forEach((coordinate, coordinateIndex) => validateCoordinate(coordinate, `${path}.coordinates[${ringIndex}][${coordinateIndex}]`));
        if (!sameCoordinate(ring[0], ring[ring.length - 1])) {
            fail(`${path}.coordinates[${ringIndex}] must be closed.`);
        }
    });
}

function validateId(value, path) {
    if (typeof value !== 'string' || value.trim() === '') {
        fail(`${path}.id must be a non-empty string.`);
    }
    return value;
}

function validateAnnotation(record, index, ids) {
    const path = `annotations[${index}]`;
    if (!isPlainObject(record) || record.type !== 'text') {
        fail(`${path} must be a text annotation record.`);
    }
    const id = validateId(record.id, path);
    if (ids.has(id)) fail(`${path}.id is duplicated.`);
    ids.add(id);
    validateGeometry(record.geometry, 'Point', `${path}.geometry`);
    if (!isPlainObject(record.properties)
        || typeof record.properties.text !== 'string' || record.properties.text.trim() === ''
        || !Number.isFinite(record.properties.fontSize)
        || record.properties.fontSize < 8 || record.properties.fontSize > 48
        || typeof record.properties.fontColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(record.properties.fontColor)
        || typeof record.properties.labelVisible !== 'boolean'
        || typeof record.properties.pointVisible !== 'boolean') {
        fail(`${path}.properties is malformed.`);
    }
    if (!record.properties.labelVisible && !record.properties.pointVisible) {
        fail(`${path} cannot hide both its label and point.`);
    }
    return record;
}

function validateSimpleRecord(record, index, category, allowedTypes, ids) {
    const path = `${category}[${index}]`;
    if (!isPlainObject(record) || typeof record.type !== 'string' || !allowedTypes[record.type]) {
        fail(`${path} has an unsupported type.`);
    }
    const id = validateId(record.id, path);
    if (ids.has(id)) fail(`${path}.id is duplicated.`);
    ids.add(id);
    validateGeometry(record.geometry, allowedTypes[record.type], `${path}.geometry`);
    return record;
}

/** Validates a parsed document without changing map state. */
export function validateFeatureSaveDocument(document) {
    if (!isPlainObject(document)) fail('The save file must contain a JSON object.');
    if (document.format !== FEATURE_SAVE_FORMAT || document.application !== FEATURE_SAVE_APPLICATION) {
        fail('This is not a GPMapCompV2 feature-save file.');
    }
    if (document.schemaVersion !== FEATURE_SAVE_SCHEMA_VERSION) {
        fail(`Unsupported feature-save schema version: ${String(document.schemaVersion)}.`);
    }
    if (typeof document.savedAt !== 'string' || Number.isNaN(Date.parse(document.savedAt))) {
        fail('The save file timestamp is invalid.');
    }
    if (document.geometryProjection !== FEATURE_SAVE_GEOMETRY_PROJECTION) {
        fail('The save file uses an unsupported geometry projection.');
    }
    for (const category of ['annotations', 'drawings', 'measurements']) {
        if (!Array.isArray(document[category])) fail(`${category} must be an array.`);
    }

    const ids = new Set();
    document.annotations.forEach((record, index) => validateAnnotation(record, index, ids));
    document.drawings.forEach((record, index) => validateSimpleRecord(record, index, 'drawings', DRAWING_GEOMETRIES, ids));
    document.measurements.forEach((record, index) => validateSimpleRecord(record, index, 'measurements', MEASUREMENT_GEOMETRIES, ids));
    return document;
}

function readGeometry(geometry, path) {
    try {
        const restored = new ol.format.GeoJSON().readGeometry(geometry, {
            dataProjection: FEATURE_SAVE_GEOMETRY_PROJECTION,
            featureProjection: getMapProjectionCode()
        });
        if (!restored) fail(`${path} could not be restored.`);
        return restored;
    } catch (error) {
        fail(`${path} could not be restored: ${error.message}`);
    }
}

function restoreAnnotation(record, index) {
    return new ol.Feature({
        geometry: readGeometry(record.geometry, `annotations[${index}].geometry`),
        gpmapPersistenceId: record.id,
        text: record.properties.text,
        fontSize: record.properties.fontSize,
        fontColor: record.properties.fontColor,
        isAnnotation: true,
        annotationLabelHidden: !record.properties.labelVisible,
        annotationPointVisible: record.properties.pointVisible
    });
}

function restoreSimpleFeature(record, index, category, propertyName) {
    return new ol.Feature({
        geometry: readGeometry(record.geometry, `${category}[${index}].geometry`),
        gpmapPersistenceId: record.id,
        [propertyName]: record.type
    });
}

/**
 * Validates and prepares every feature before merging it into the live map.
 * Existing items are never cleared or replaced.
 */
export function restoreFeatureSaveDocument(document) {
    const validDocument = validateFeatureSaveDocument(document);
    // A load merges with the current map. Persistent IDs identify an item for
    // its whole lifetime, so an existing ID is a duplicate to skip, never an
    // occasion to generate a replacement ID.
    const itemsByCategory = getSavableFeatureItems().reduce((ids, item) => {
        ids[item.category].add(item.id);
        return ids;
    }, {
        annotations: new Set(),
        drawings: new Set(),
        measurements: new Set()
    });
    const restoreNewRecords = (records, category, restore) => {
        const existingIds = itemsByCategory[category];
        const newRecords = records.filter((record) => !existingIds.has(record.id));
        return {
            features: newRecords.map(restore),
            skipped: records.length - newRecords.length
        };
    };
    const annotations = restoreNewRecords(
        validDocument.annotations,
        'annotations',
        (record, index) => restoreAnnotation(record, index)
    );
    const drawings = restoreNewRecords(
        validDocument.drawings,
        'drawings',
        (record, index) => restoreSimpleFeature(record, index, 'drawings', 'drawingType')
    );
    const measurements = restoreNewRecords(
        validDocument.measurements,
        'measurements',
        (record, index) => restoreSimpleFeature(record, index, 'measurements', 'measurementType')
    );
    const restored = {
        annotations: annotations.features,
        drawings: drawings.features,
        measurements: measurements.features
    };

    restoreFeatureSavingCollections(restored);
    return {
        annotations: restored.annotations.length,
        drawings: restored.drawings.length,
        measurements: restored.measurements.length,
        skipped: annotations.skipped + drawings.skipped + measurements.skipped
    };
}

/** Reads and validates a user-selected local JSON file without restoring it. */
export async function readFeatureSaveFile(file) {
    if (!file || typeof file.text !== 'function') {
        fail('Select a JSON feature-save file first.');
    }

    let document;
    try {
        document = JSON.parse(await file.text());
    } catch {
        fail('The selected file is not valid JSON.');
    }
    return validateFeatureSaveDocument(document);
}

/** Reads, validates, then merge-restores a selected local save file. */
export async function loadFeatureSaveFile(file) {
    return restoreFeatureSaveDocument(await readFeatureSaveFile(file));
}

export function getFeatureSaveFilename(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
    return `NAMRIA_GPMapComp_Features_${timestamp}.json`;
}

/** Triggers a browser download; no browser storage or backend is used. */
export function downloadFeatureSaveFile(selection = null) {
    const document = createFeatureSaveDocument(selection);
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = getFeatureSaveFilename();
    link.style.display = 'none';
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return document;
}
