import { DEFAULT_LAYER_COLOR, DEFAULT_LAYER_NAME } from '../config/constants.js';
import ol from '../lib/ol.js';
import { addVectorLayer, addWmsLayer, fitLayerToView } from '../map/layer-manager.js';
import { getCurrentLayerData, getLayerRecord, getState, setCurrentLayerData } from '../state/store.js';
import { formatFileSize } from '../utils/format.js';
import { parseUploadFile } from '../services/shapefile-service.js';
import { createGpLayerConfig } from '../services/gp-service.js';
import { createWmsLayerConfig } from '../services/wms-service.js';
import { addLayerItem, removeLayerItem } from '../ui/layers-panel.js';
import { closeModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { GEOPORTAL_WMS_URL, WMS_URL } from '../config/constants.js';

let availableWmsLayers = [];
let wmsFetchRequestId = 0;
let availableGpLayers = [];
let gpFetchRequestId = 0;
let gpLayerCache = null;
let gpLayerFetchPromise = null;
let gpSearchDebounceId = null;
let gpHighlightedLayerIndex = -1;
const GP_SEARCH_DEBOUNCE_MS = 180;

function formatLayerNameFromFileName(fileName = '') {
    const baseName = fileName
        .replace(/\.(geojson|json|kml|kmz|csv|zip|shp)$/i, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!baseName) {
        return '';
    }

    return baseName.replace(/\w\S*/g, (word) => {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

function makeUniqueLayerName(baseName) {
    const normalizedName = baseName || DEFAULT_LAYER_NAME;

    if (!getLayerRecord(normalizedName)) {
        return normalizedName;
    }

    let index = 2;
    while (getLayerRecord(`${normalizedName} ${index}`)) {
        index += 1;
    }

    return `${normalizedName} ${index}`;
}

function applyDefaultLayerName(file) {
    const layerNameInput = document.getElementById('layerName');
    if (!layerNameInput || !file) {
        return;
    }

    const shouldAutofill = !layerNameInput.value.trim() || layerNameInput.dataset.autoLayerName === 'true';
    if (!shouldAutofill) {
        return;
    }

    const defaultName = makeUniqueLayerName(formatLayerNameFromFileName(file.name));
    layerNameInput.value = defaultName;
    layerNameInput.dataset.autoLayerName = 'true';
}

function setUploadBusyState(isBusy, label = 'Processing file...') {
    const progress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressLabel = progress?.querySelector('div');
    const submitButton = document.getElementById('submitBtn');

    if (progress) {
        progress.style.display = isBusy ? 'block' : 'none';
    }

    if (progressLabel) {
        progressLabel.textContent = label;
    }

    if (progressFill) {
        progressFill.style.width = isBusy ? '100%' : '0%';
        progressFill.classList.toggle('is-indeterminate', isBusy);
    }

    if (submitButton) {
        submitButton.disabled = isBusy;
        submitButton.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    }
}

export function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('filePreview').classList.add('active');
    setCurrentLayerData({ file, type: 'shapefile' });
    applyDefaultLayerName(file);
}

export function handleGeoJSONSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    document.getElementById('geojsonFileName').textContent = file.name;
    document.getElementById('geojsonFileSize').textContent = formatFileSize(file.size);
    document.getElementById('geojsonFilePreview').classList.add('active');
    setCurrentLayerData({ file, type: 'geojson' });
    applyDefaultLayerName(file);
}

export function handleKmlSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    document.getElementById('kmlFileName').textContent = file.name;
    document.getElementById('kmlFileSize').textContent = formatFileSize(file.size);
    document.getElementById('kmlFilePreview').classList.add('active');
    setCurrentLayerData({ file, type: 'kml' });
    applyDefaultLayerName(file);
}

export function handleCsvSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    document.getElementById('csvFileName').textContent = file.name;
    document.getElementById('csvFileSize').textContent = formatFileSize(file.size);
    document.getElementById('csvFilePreview').classList.add('active');
    setCurrentLayerData({ file, type: 'csv' });
    applyDefaultLayerName(file);
}

export function clearFileSelection() {
    document.getElementById('fileInput').value = '';
    document.getElementById('filePreview').classList.remove('active');
    setCurrentLayerData(null);
}

export function clearGeoJSONSelection() {
    document.getElementById('geojsonInput').value = '';
    document.getElementById('geojsonFilePreview').classList.remove('active');
    setCurrentLayerData(null);
}

export function clearKmlSelection() {
    document.getElementById('kmlInput').value = '';
    document.getElementById('kmlFilePreview').classList.remove('active');
    setCurrentLayerData(null);
}

export function clearCsvSelection() {
    document.getElementById('csvInput').value = '';
    document.getElementById('csvFilePreview').classList.remove('active');
    setCurrentLayerData(null);
}

export function updateDataSection() {
    const dataType = document.getElementById('dataTypeSelect').value;

    document.getElementById('shapefileSection').style.display = dataType === 'shapefile' ? 'block' : 'none';
    document.getElementById('geojsonSection').style.display = dataType === 'geojson' ? 'block' : 'none';
    document.getElementById('kmlSection').style.display = dataType === 'kml' ? 'block' : 'none';
    document.getElementById('csvSection').style.display = dataType === 'csv' ? 'block' : 'none';
}

export async function submitUpload() {
    const currentLayerData = getCurrentLayerData();
    if (!currentLayerData) {
        showToast('No File Selected', 'Select a file before uploading.', 'warning');
        return;
    }

    const enteredLayerName = document.getElementById('layerName').value.trim();
    const layerName = makeUniqueLayerName(enteredLayerName || formatLayerNameFromFileName(currentLayerData.file?.name) || DEFAULT_LAYER_NAME);
    const layerColor = document.getElementById('layerColor').value || DEFAULT_LAYER_COLOR;
    setUploadBusyState(true, 'Uploading...');

    try {
        const { geojson, features, sourceCrs, sourceCrsDetected } = await parseUploadFile(currentLayerData);
        if (features.length === 0) {
            showToast('No Features Found', 'The selected file did not contain any usable features.', 'warning');
            return;
        }

        const record = addVectorLayer(layerName, layerColor, geojson, features, {
            sourceCrs,
            sourceCrsDetected
        });
        fitLayerToView(record.source);
        addLayerItem(layerName, layerColor, features.length);

        closeModal('uploadModal');
        document.getElementById('layerName').value = '';
        document.getElementById('layerName').dataset.autoLayerName = 'true';
        clearFileSelection();
        clearGeoJSONSelection();
        clearKmlSelection();
        clearCsvSelection();

        showToast('Layer Added', `"${layerName}" was added with ${features.length} feature${features.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
        console.error('Error processing upload:', error);
        showToast('Upload Failed', 'The file could not be loaded.', 'error');
    } finally {
        setUploadBusyState(false);
    }
}

export function initializeUploadForm() {
    const layerNameInput = document.getElementById('layerName');
    if (!layerNameInput) {
        return;
    }

    layerNameInput.dataset.autoLayerName = 'true';
    layerNameInput.addEventListener('input', () => {
        layerNameInput.dataset.autoLayerName = layerNameInput.value.trim() ? 'false' : 'true';
    });
}

export function addWMSLayerFromForm() {
    closeModal('wmsModal');
}

export function addGPLayerFromForm() {
    closeModal('gpModal');
}

function getWmsFeedbackElement() {
    return document.getElementById('wmsFetchFeedback');
}

function setWmsFetchFeedback(message = '', state = '') {
    const feedback = getWmsFeedbackElement();
    if (!feedback) {
        return;
    }

    feedback.textContent = message;
    feedback.dataset.state = state;
}

function resetWmsFetchFeedback() {
    setWmsFetchFeedback('', '');
}

function setWmsFetchBusyState(isBusy) {
    const fetchButton = document.getElementById('wmsFetchButton');
    if (!fetchButton) {
        return;
    }

    fetchButton.disabled = isBusy;
    fetchButton.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    fetchButton.innerHTML = isBusy
        ? '<i class="fas fa-spinner fa-spin"></i> Fetching'
        : '<i class="fas fa-cloud-arrow-down"></i> Fetch';
}

function setWmsLayerChecklistEmpty(message = 'Fetch WMS capabilities to show available layers.') {
    const checklist = document.getElementById('wmsLayerChecklist');
    if (!checklist) {
        return;
    }

    checklist.replaceChildren(Object.assign(document.createElement('div'), {
        className: 'wms-layer-empty',
        textContent: message
    }));
}

function updateWmsFetchButtonVisibility() {
    const input = document.getElementById('wmsUrl');
    const fetchButton = document.getElementById('wmsFetchButton');
    if (!input || !fetchButton) {
        return;
    }

    fetchButton.hidden = input.value.trim().length === 0;
}

function buildCapabilitiesUrl(wmsUrl) {
    const url = new URL(wmsUrl, window.location.href);
    url.searchParams.set('SERVICE', 'WMS');
    url.searchParams.set('REQUEST', 'GetCapabilities');
    return url.toString();
}

function normalizeLayerExtent(extent) {
    if (!Array.isArray(extent) || extent.length !== 4) {
        return null;
    }

    const normalized = extent.map((value) => Number(value));
    if (!normalized.every(Number.isFinite)) {
        return null;
    }

    const [minX, minY, maxX, maxY] = normalized;
    if (minX >= maxX || minY >= maxY) {
        return null;
    }

    return normalized;
}

function normalizeExtentProjection(code) {
    const value = String(code || '').trim().toUpperCase();
    if (!value) {
        return null;
    }

    if (value.includes('CRS:84') || value.includes('OGC:1.3:CRS84') || value.includes('EPSG:4326')) {
        return 'EPSG:4326';
    }

    if (value.includes('EPSG:3857') || value.includes('EPSG:900913')) {
        return 'EPSG:3857';
    }

    return null;
}

function extractLayerExtentInfo(layer) {
    const geographicExtent = normalizeLayerExtent(layer?.EX_GeographicBoundingBox);
    if (geographicExtent) {
        return {
            layerExtent: geographicExtent,
            layerExtentProjection: 'EPSG:4326',
            zoomUnavailableReason: ''
        };
    }

    const latLonExtent = normalizeLayerExtent(layer?.LatLonBoundingBox?.extent);
    if (latLonExtent) {
        return {
            layerExtent: latLonExtent,
            layerExtentProjection: 'EPSG:4326',
            zoomUnavailableReason: ''
        };
    }

    const bbox = (layer?.BoundingBox || [])
        .map((entry) => ({
            extent: normalizeLayerExtent(entry?.extent),
            projection: normalizeExtentProjection(entry?.crs || entry?.srs)
        }))
        .find((entry) => entry.extent && entry.projection);

    if (bbox) {
        return {
            layerExtent: bbox.extent,
            layerExtentProjection: bbox.projection,
            zoomUnavailableReason: ''
        };
    }

    return {
        layerExtent: null,
        layerExtentProjection: '',
        zoomUnavailableReason: 'This service does not advertise a usable geographic extent for this layer.'
    };
}

function flattenWmsCapabilityLayers(layer, layers = []) {
    if (!layer) {
        return layers;
    }

    if (layer.Name) {
        const extentInfo = extractLayerExtentInfo(layer);
        layers.push({
            name: layer.Name,
            title: layer.Title || layer.Name,
            ...extentInfo
        });
    }

    (layer.Layer || []).forEach((childLayer) => flattenWmsCapabilityLayers(childLayer, layers));
    return layers;
}

function normalizeWmsUrl(wmsUrl) {
    try {
        const url = new URL(wmsUrl, window.location.href);
        url.search = '';
        return url.toString().replace(/\/$/, '');
    } catch {
        return wmsUrl.replace(/\?.*$/, '').replace(/\/$/, '');
    }
}

function getWmsLayerKey(wmsUrl, wmsLayerName) {
    return `${normalizeWmsUrl(wmsUrl)}::${wmsLayerName}`;
}

function getWmsRecordKey(record) {
    return getWmsLayerKey(record?.wmsUrl || '', record?.wmsLayerName || '');
}

function findExistingWmsLayerName(wmsUrl, wmsLayerName) {
    const key = getWmsLayerKey(wmsUrl, wmsLayerName);
    return Object.entries(getState().uploadedLayers)
        .find(([, record]) => record?.isWMS && getWmsRecordKey(record) === key)?.[0] || null;
}

function buildWmsDisplayName(layerInfo) {
    const baseName = layerInfo.title && layerInfo.title !== layerInfo.name
        ? layerInfo.title
        : layerInfo.name;

    if (!getLayerRecord(baseName)) {
        return baseName;
    }

    const wmsName = `${baseName} (WMS)`;
    if (!getLayerRecord(wmsName)) {
        return wmsName;
    }

    let index = 2;
    while (getLayerRecord(`${wmsName} ${index}`)) {
        index += 1;
    }
    return `${wmsName} ${index}`;
}

function getSelectedWmsLayerCount() {
    const wmsUrl = document.getElementById('wmsUrl')?.value?.trim() || '';
    return availableWmsLayers.filter((layerInfo) => findExistingWmsLayerName(wmsUrl, layerInfo.name)).length;
}

function updateWmsLayerPickerSummary() {
    const summary = document.getElementById('wmsLayerPickerSummary');
    if (!summary) {
        return;
    }

    if (availableWmsLayers.length === 0) {
        summary.textContent = 'Fetch layers to select';
        return;
    }

    const selectedCount = getSelectedWmsLayerCount();
    summary.textContent = selectedCount > 0
        ? `${selectedCount} WMS layer${selectedCount === 1 ? '' : 's'} selected`
        : `${availableWmsLayers.length} layers available`;
}

function setWmsLayerChecklistOpen(isOpen) {
    const trigger = document.getElementById('wmsLayerPickerTrigger');
    const checklist = document.getElementById('wmsLayerChecklist');
    if (!trigger || !checklist) {
        return;
    }

    checklist.hidden = !isOpen;
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function removeWmsLayerFromMap(wmsUrl, wmsLayerName) {
    const existingLayerName = findExistingWmsLayerName(wmsUrl, wmsLayerName);
    if (!existingLayerName) {
        return;
    }

    removeLayerItem(existingLayerName);
}

function addWmsLayerToMap(wmsUrl, layerInfo) {
    const existingLayerName = findExistingWmsLayerName(wmsUrl, layerInfo.name);
    if (existingLayerName) {
        const record = getLayerRecord(existingLayerName);
        record?.layer?.setVisible?.(true);
        return;
    }

    try {
        const displayName = buildWmsDisplayName(layerInfo);
        const { source, layer } = createWmsLayerConfig(wmsUrl, layerInfo.name);
        addWmsLayer(displayName, source, layer, {
            wmsUrl,
            wmsLayerName: layerInfo.name,
            displayName,
            layerExtent: layerInfo.layerExtent,
            layerExtentProjection: layerInfo.layerExtentProjection,
            zoomUnavailableReason: layerInfo.zoomUnavailableReason,
            sourceCrs: 'Unknown CRS',
            sourceCrsDetected: false
        });
        addLayerItem(displayName, DEFAULT_LAYER_COLOR, 0, { isWMS: true });
    } catch (error) {
        console.error('Error previewing WMS layer:', error);
        showToast('WMS Preview Failed', 'Could not preview the WMS layer.', 'error');
    }
}

function handleWmsLayerChecklistChange(event) {
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement)) {
        return;
    }

    const wmsUrl = document.getElementById('wmsUrl')?.value?.trim() || '';
    const layerInfo = availableWmsLayers.find((layer) => layer.name === checkbox.value);
    if (!wmsUrl || !layerInfo) {
        checkbox.checked = false;
        return;
    }

    if (checkbox.checked) {
        addWmsLayerToMap(wmsUrl, layerInfo);
    } else {
        removeWmsLayerFromMap(wmsUrl, layerInfo.name);
    }

    updateWmsLayerPickerSummary();
}

function renderWmsLayerChecklist(layers) {
    const checklist = document.getElementById('wmsLayerChecklist');
    if (!checklist) {
        return;
    }

    const wmsUrl = document.getElementById('wmsUrl')?.value?.trim() || '';

    if (layers.length === 0) {
        setWmsLayerChecklistEmpty();
        updateWmsLayerPickerSummary();
        return;
    }

    checklist.replaceChildren(...layers.map((layerInfo) => {
        const label = document.createElement('label');
        label.className = 'wms-layer-checklist-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = layerInfo.name;
        checkbox.checked = Boolean(findExistingWmsLayerName(wmsUrl, layerInfo.name));
        checkbox.addEventListener('change', handleWmsLayerChecklistChange);

        const text = document.createElement('span');
        const title = document.createElement('span');
        title.className = 'wms-layer-checklist-title';
        title.textContent = layerInfo.title || layerInfo.name;

        const name = document.createElement('span');
        name.className = 'wms-layer-checklist-name';
        name.textContent = layerInfo.name;

        text.append(title, name);
        label.append(checkbox, text);
        return label;
    }));

    updateWmsLayerPickerSummary();
}

export async function fetchWmsCapabilitiesFromForm() {
    const input = document.getElementById('wmsUrl');
    const wmsUrl = input?.value?.trim() || '';
    const requestId = wmsFetchRequestId + 1;
    wmsFetchRequestId = requestId;

    resetWmsFetchFeedback();

    if (!wmsUrl) {
        updateWmsFetchButtonVisibility();
        return;
    }

    setWmsFetchBusyState(true);

    try {
        const response = await fetch(buildCapabilitiesUrl(wmsUrl));
        if (requestId !== wmsFetchRequestId) {
            return;
        }

        if (!response.ok) {
            throw new Error(`GetCapabilities failed with HTTP ${response.status}`);
        }

        const xmlText = await response.text();
        if (requestId !== wmsFetchRequestId) {
            return;
        }

        const parsedCapabilities = new ol.format.WMSCapabilities().read(xmlText);
        const layers = flattenWmsCapabilityLayers(parsedCapabilities?.Capability?.Layer);
        if (requestId !== wmsFetchRequestId) {
            return;
        }

        availableWmsLayers = layers;

        renderWmsLayerChecklist(layers);
        setWmsLayerChecklistOpen(true);

        if (layers.length === 0) {
            setWmsFetchFeedback('No named WMS layers were found in the capabilities response.', 'warning');
            return;
        }

        setWmsFetchFeedback(`${layers.length} WMS layer${layers.length === 1 ? '' : 's'} available.`, 'success');
    } catch (error) {
        if (requestId !== wmsFetchRequestId) {
            return;
        }

        console.warn('WMS GetCapabilities request failed:', error);
        availableWmsLayers = [];
        renderWmsLayerChecklist([]);
        setWmsFetchFeedback('Could not fetch WMS capabilities. Check the URL, network access, or CORS settings.', 'warning');
        showToast('WMS Fetch Failed', 'Could not fetch WMS layers.', 'error');
    } finally {
        if (requestId === wmsFetchRequestId) {
            setWmsFetchBusyState(false);
            updateWmsFetchButtonVisibility();
        }
    }
}

export function resetWmsLayerFormSession({ restoreDefaultUrl = true } = {}) {
    const input = document.getElementById('wmsUrl');

    wmsFetchRequestId += 1;
    availableWmsLayers = [];

    if (restoreDefaultUrl && input) {
        input.value = WMS_URL;
    }

    resetWmsFetchFeedback();
    setWmsFetchBusyState(false);
    setWmsLayerChecklistEmpty();
    updateWmsLayerPickerSummary();
    setWmsLayerChecklistOpen(false);
    updateWmsFetchButtonVisibility();
}

export function initializeWmsLayerForm() {
    const input = document.getElementById('wmsUrl');
    const fetchButton = document.getElementById('wmsFetchButton');
    const pickerTrigger = document.getElementById('wmsLayerPickerTrigger');
    const checklist = document.getElementById('wmsLayerChecklist');
    if (!input || !fetchButton || !pickerTrigger || !checklist) {
        return;
    }

    if (!input.value.trim()) {
        input.value = WMS_URL;
    }

    updateWmsFetchButtonVisibility();
    input.addEventListener('input', () => {
        resetWmsLayerFormSession({ restoreDefaultUrl: false });
    });
    fetchButton.addEventListener('click', () => fetchWmsCapabilitiesFromForm());
    pickerTrigger.addEventListener('click', () => {
        setWmsLayerChecklistOpen(checklist.hidden);
    });
}

function getGpFeedbackElement() {
    return document.getElementById('gpFetchFeedback');
}

function setGpFetchFeedback(message = '', state = '') {
    const feedback = getGpFeedbackElement();
    if (!feedback) {
        return;
    }

    feedback.textContent = message;
    feedback.dataset.state = state;
}

function setGpLayerChecklistEmpty(message, { retry = false } = {}) {
    const checklist = document.getElementById('gpLayerChecklist');
    if (!checklist) {
        return;
    }

    const emptyState = Object.assign(document.createElement('div'), {
        className: 'wms-layer-empty',
        textContent: message
    });

    if (!retry) {
        checklist.replaceChildren(emptyState);
        return;
    }

    const retryButton = Object.assign(document.createElement('button'), {
        type: 'button',
        className: 'btn btn-secondary gp-layer-retry',
        textContent: 'Retry'
    });
    retryButton.addEventListener('click', () => fetchGpLayersFromForm());
    checklist.replaceChildren(emptyState, retryButton);
}

function setGpLayerLoadingState(isLoading) {
    const search = document.getElementById('gpLayerSearch');
    if (search) {
        search.disabled = isLoading;
        search.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    }
    const clearButton = document.getElementById('gpLayerSearchClear');
    if (clearButton) clearButton.hidden = isLoading || !search?.value;
}

function setGpLayerLoadingMessage() {
    const checklist = document.getElementById('gpLayerChecklist');
    if (!checklist) return;
    checklist.replaceChildren(Object.assign(document.createElement('div'), {
        className: 'wms-layer-empty gp-layer-loading',
        innerHTML: '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Loading official Geoportal layers...</span>'
    }));
}

function normalizeGpUrl(gpUrl) {
    try {
        const url = new URL(gpUrl, window.location.href);
        url.search = '';
        return url.toString().replace(/\/$/, '');
    } catch {
        return gpUrl.replace(/\?.*$/, '').replace(/\/$/, '');
    }
}

function getGpLayerKey(gpUrl, gpLayerName) {
    return `${normalizeGpUrl(gpUrl)}::${gpLayerName}`;
}

function getGpRecordKey(record) {
    return getGpLayerKey(record?.gpUrl || '', record?.gpLayerName || '');
}

function findExistingGpLayerName(gpUrl, gpLayerName) {
    const key = getGpLayerKey(gpUrl, gpLayerName);
    return Object.entries(getState().uploadedLayers)
        .find(([, record]) => record?.isGP && getGpRecordKey(record) === key)?.[0] || null;
}

function buildGpDisplayName(layerInfo) {
    const baseName = layerInfo.title && layerInfo.title !== layerInfo.name
        ? layerInfo.title
        : layerInfo.name;
    const gpName = `${baseName} (GP)`;

    if (!getLayerRecord(gpName)) {
        return gpName;
    }

    let index = 2;
    while (getLayerRecord(`${gpName} ${index}`)) {
        index += 1;
    }
    return `${gpName} ${index}`;
}

function removeGpLayerFromMap(gpUrl, gpLayerName) {
    const existingLayerName = findExistingGpLayerName(gpUrl, gpLayerName);
    if (!existingLayerName) {
        return;
    }

    removeLayerItem(existingLayerName);
}

function addGpLayerToMap(gpUrl, layerInfo) {
    const existingLayerName = findExistingGpLayerName(gpUrl, layerInfo.name);
    if (existingLayerName) {
        const record = getLayerRecord(existingLayerName);
        record?.layer?.setVisible?.(true);
        return;
    }

    try {
        const displayName = buildGpDisplayName(layerInfo);
        const { source, layer } = createGpLayerConfig(gpUrl, layerInfo);
        addWmsLayer(displayName, source, layer, {
            isGP: true,
            gpUrl,
            gpLayerName: layerInfo.name,
            gpLayerType: layerInfo.type || 'xyz',
            gpTileUrl: layerInfo.tileUrl || '',
            wmsUrl: layerInfo.type === 'wms' ? (layerInfo.url || gpUrl) : '',
            wmsLayerName: layerInfo.type === 'wms' ? layerInfo.name : '',
            displayName,
            layerExtent: layerInfo.layerExtent || null,
            layerExtentProjection: layerInfo.layerExtentProjection || '',
            zoomUnavailableReason: layerInfo.zoomUnavailableReason || 'This Geoportal layer does not expose a geographic extent in the configured catalog.',
            sourceCrs: 'Unknown CRS',
            sourceCrsDetected: false
        });
        addLayerItem(displayName, DEFAULT_LAYER_COLOR, 0, { isWMS: true, isGP: true });
    } catch (error) {
        console.error('Error previewing Geoportal layer:', error);
        showToast('Geoportal Preview Failed', 'Could not preview the Geoportal layer.', 'error');
    }
}

function handleGpLayerChecklistChange(event) {
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement)) {
        return;
    }

    const gpUrl = GEOPORTAL_WMS_URL;
    const layerInfo = availableGpLayers.find((layer) => layer.name === checkbox.value);
    if (!gpUrl || !layerInfo) {
        checkbox.checked = false;
        return;
    }

    if (checkbox.checked) {
        addGpLayerToMap(gpUrl, layerInfo);
    } else {
        removeGpLayerFromMap(gpUrl, layerInfo.name);
    }

}

function renderGpLayerChecklist(layers) {
    const checklist = document.getElementById('gpLayerChecklist');
    if (!checklist) {
        return;
    }

    if (layers.length === 0) {
        gpHighlightedLayerIndex = -1;
        const query = document.getElementById('gpLayerSearch')?.value.trim() || '';
        const emptyState = document.createElement('div');
        emptyState.className = 'gp-layer-no-results';
        emptyState.innerHTML = `<div class="gp-layer-no-results-icon" aria-hidden="true">🔍</div><div class="gp-layer-no-results-title">No Geoportal layers found</div><div>No layers match &quot;${query.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}&quot;.</div><div>Try another keyword.</div>`;
        checklist.replaceChildren(emptyState);
        return;
    }

    checklist.replaceChildren(...layers.map((layerInfo, index) => {
        const label = document.createElement('label');
        label.className = 'wms-layer-checklist-item';
        label.dataset.gpLayerIndex = String(index);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = layerInfo.name;
        checkbox.checked = Boolean(findExistingGpLayerName(GEOPORTAL_WMS_URL, layerInfo.name));
        checkbox.addEventListener('change', handleGpLayerChecklistChange);
        label.addEventListener('click', () => setGpHighlightedLayer(index));
        label.addEventListener('pointerenter', () => setGpHighlightedLayer(index));

        const text = document.createElement('span');
        const title = document.createElement('span');
        title.className = 'wms-layer-checklist-title';
        title.textContent = layerInfo.title || layerInfo.name;

        const name = document.createElement('span');
        name.className = 'wms-layer-checklist-name';
        name.textContent = layerInfo.name;

        text.append(title, name);
        label.append(checkbox, text);
        return label;
    }));

    if (gpHighlightedLayerIndex >= 0) {
        setGpHighlightedLayer(Math.min(gpHighlightedLayerIndex, layers.length - 1));
    }
}

function getVisibleGpLayerItems() {
    return Array.from(document.querySelectorAll('#gpLayerChecklist .wms-layer-checklist-item'));
}

function setGpHighlightedLayer(index, { scrollIntoView = false } = {}) {
    const items = getVisibleGpLayerItems();
    if (items.length === 0) {
        gpHighlightedLayerIndex = -1;
        return;
    }

    gpHighlightedLayerIndex = Math.min(Math.max(index, 0), items.length - 1);
    items.forEach((item, itemIndex) => {
        const isHighlighted = itemIndex === gpHighlightedLayerIndex;
        item.classList.toggle('is-active', isHighlighted);
    });

    if (scrollIntoView) {
        items[gpHighlightedLayerIndex].scrollIntoView({ block: 'nearest' });
    }
}

function handleGpLayerSearchKeydown(event) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const items = getVisibleGpLayerItems();
        if (items.length === 0) return;

        event.preventDefault();
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        const startIndex = gpHighlightedLayerIndex < 0
            ? (direction > 0 ? 0 : items.length - 1)
            : gpHighlightedLayerIndex + direction;
        setGpHighlightedLayer(startIndex, { scrollIntoView: true });
        return;
    }

    if (event.key === 'Enter' && gpHighlightedLayerIndex >= 0) {
        const checkbox = getVisibleGpLayerItems()[gpHighlightedLayerIndex]?.querySelector('input[type="checkbox"]');
        if (!checkbox) return;

        event.preventDefault();
        if (!checkbox.checked) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}

export async function fetchGpLayersFromForm() {
    const requestId = gpFetchRequestId + 1;
    gpFetchRequestId = requestId;
    const gpUrl = GEOPORTAL_WMS_URL;
    setGpFetchFeedback('Loading official Geoportal layers...', '');
    setGpLayerLoadingState(true);
    setGpLayerLoadingMessage();

    try {
        gpLayerFetchPromise ||= (async () => {
            const response = await fetch(buildCapabilitiesUrl(gpUrl));
            if (!response.ok) {
                throw new Error(`Geoportal capabilities failed with HTTP ${response.status}`);
            }
            const parsedCapabilities = new ol.format.WMSCapabilities().read(await response.text());
            return flattenWmsCapabilityLayers(parsedCapabilities?.Capability?.Layer)
                .map((layerInfo) => ({ ...layerInfo, type: 'wms', url: gpUrl }))
                .sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, undefined, { sensitivity: 'base' }));
        })();
        const layers = await gpLayerFetchPromise;
        if (requestId !== gpFetchRequestId) {
            return;
        }
        gpLayerCache = layers;
        availableGpLayers = layers;
        renderGpLayerChecklist(getFilteredGpLayers());
        updateGpLayerCount();
        setGpLayerLoadingState(false);
        document.getElementById('gpLayerSearch')?.focus();
    } catch (error) {
        if (requestId !== gpFetchRequestId) return;
        console.warn('Geoportal layer fetch failed:', error);
        gpLayerFetchPromise = null;
        setGpFetchFeedback('Could not load official Geoportal layers. Please check your connection and try again.', 'warning');
        setGpLayerChecklistEmpty('Unable to load official Geoportal layers.', { retry: true });
        setGpLayerLoadingState(false);
        document.getElementById('gpLayerSearch')?.focus();
    }
}

function getFilteredGpLayers() {
    const query = document.getElementById('gpLayerSearch')?.value.trim().toLocaleLowerCase() || '';
    return !query ? availableGpLayers : availableGpLayers.filter((layer) =>
        `${layer.title || ''} ${layer.name || ''}`.toLocaleLowerCase().includes(query)
    );
}

function updateGpLayerCount() {
    const filteredCount = getFilteredGpLayers().length;
    const hasSearch = Boolean(document.getElementById('gpLayerSearch')?.value.trim());
    setGpFetchFeedback(hasSearch
        ? `${filteredCount.toLocaleString()} matching layer${filteredCount === 1 ? '' : 's'}`
        : `${availableGpLayers.length.toLocaleString()} layers available`, 'success');
}

function handleGpLayerSearch() {
    const search = document.getElementById('gpLayerSearch');
    const clearButton = document.getElementById('gpLayerSearchClear');
    if (clearButton) clearButton.hidden = !search?.value;
    renderGpLayerChecklist(getFilteredGpLayers());
    updateGpLayerCount();
}

function scheduleGpLayerSearch() {
    const search = document.getElementById('gpLayerSearch');
    const clearButton = document.getElementById('gpLayerSearchClear');
    if (clearButton) clearButton.hidden = !search?.value;

    window.clearTimeout(gpSearchDebounceId);
    gpSearchDebounceId = window.setTimeout(handleGpLayerSearch, GP_SEARCH_DEBOUNCE_MS);
}

export function prepareGpLayerDialog() {
    const search = document.getElementById('gpLayerSearch');
    window.clearTimeout(gpSearchDebounceId);
    gpHighlightedLayerIndex = -1;
    if (search) search.value = '';
    if (gpLayerCache) {
        availableGpLayers = gpLayerCache;
        setGpLayerLoadingState(false);
        renderGpLayerChecklist(availableGpLayers);
        updateGpLayerCount();
        search?.focus();
        return;
    }
    fetchGpLayersFromForm();
}

export function initializeGpLayerForm() {
    const search = document.getElementById('gpLayerSearch');
    if (!search || !document.getElementById('gpLayerChecklist')) {
        return;
    }
    search.addEventListener('input', scheduleGpLayerSearch);
    search.addEventListener('keydown', handleGpLayerSearchKeydown);
    document.getElementById('gpLayerSearchClear')?.addEventListener('click', () => {
        search.value = '';
        window.clearTimeout(gpSearchDebounceId);
        handleGpLayerSearch();
        search.focus();
    });
}
