import { DEFAULT_LAYER_COLOR, DEFAULT_LAYER_NAME } from '../config/constants.js';
import { addVectorLayer, addWmsLayer, fitLayerToView } from '../map/layer-manager.js';
import { getCurrentLayerData, setCurrentLayerData } from '../state/store.js';
import { formatFileSize } from '../utils/format.js';
import { hasRequiredValues } from '../utils/validators.js';
import { parseUploadFile } from '../services/shapefile-service.js';
import { createWmsLayerConfig } from '../services/wms-service.js';
import { addLayerItem } from '../ui/layers-panel.js';
import { closeModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

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
        showToast('Error', 'Please select a file', 'error');
        return;
    }

    const layerName = document.getElementById('layerName').value || DEFAULT_LAYER_NAME;
    const layerColor = document.getElementById('layerColor').value || DEFAULT_LAYER_COLOR;
    setUploadBusyState(true);

    try {
        const { geojson, features } = await parseUploadFile(currentLayerData);
        if (features.length === 0) {
            showToast('Error', 'No valid features found in file', 'error');
            return;
        }

        const record = addVectorLayer(layerName, layerColor, geojson, features);
        fitLayerToView(record.source);
        addLayerItem(layerName, layerColor, features.length);

        closeModal('uploadModal');
        document.getElementById('layerName').value = '';
        clearFileSelection();
        clearGeoJSONSelection();
        clearKmlSelection();
        clearCsvSelection();

        showToast('Success', `Layer "${layerName}" added with ${features.length} features`, 'success');
    } catch (error) {
        console.error('Error processing upload:', error);
        showToast('Error', `Failed to process file: ${error.message}`, 'error');
    } finally {
        setUploadBusyState(false);
    }
}

export function addWMSLayerFromForm() {
    const wmsUrl = document.getElementById('wmsUrl').value.trim();
    const wmsLayerName = document.getElementById('wmsLayerName').value.trim();
    const wmsDisplayName = document.getElementById('wmsDisplayName').value.trim() || wmsLayerName;

    if (!hasRequiredValues(wmsUrl, wmsLayerName)) {
        showToast('Error', 'Please enter both WMS URL and Layer Name', 'error');
        return;
    }

    try {
        const { source, layer } = createWmsLayerConfig(wmsUrl, wmsLayerName);
        addWmsLayer(wmsDisplayName, source, layer, {
            wmsUrl,
            wmsLayerName,
            displayName: wmsDisplayName
        });
        addLayerItem(wmsDisplayName, DEFAULT_LAYER_COLOR, 0, { isWMS: true });

        document.getElementById('wmsUrl').value = '';
        document.getElementById('wmsLayerName').value = '';
        document.getElementById('wmsDisplayName').value = '';
        closeModal('wmsModal');

        showToast('Success', `WMS layer "${wmsDisplayName}" added successfully`, 'success');
    } catch (error) {
        console.error('Error adding WMS layer:', error);
        showToast('Error', `Failed to add WMS layer: ${error.message}`, 'error');
    }
}
