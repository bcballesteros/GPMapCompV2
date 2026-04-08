document.addEventListener('DOMContentLoaded', function() {
    let map;
    let layerCache = {}; // { layerName: { source, layer, geojson, features } }
    let currentLayerName = null;
    let annotationMode = false;
    let annotationClickListener = null;
    let highlightedFeature = null;
    let highlightStyle = null;
    
    // ========== TOAST NOTIFICATION SYSTEM ==========
    function showToast(title, message = '', type = 'info', duration = 4000) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '<i class="fas fa-check-circle"></i>',
            error: '<i class="fas fa-exclamation-circle"></i>',
            info: '<i class="fas fa-info-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, duration);
    }

    // ========== MODAL FUNCTIONS ==========
    function openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
        // Render map preview when export modal is opened
        if (modalId === 'exportModal') {
            setTimeout(() => renderMapPreview(), 100);
        }
    }

    function closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    // ========== TOGGLE SECTIONS ==========
    function toggleSection(header) {
        const content = header.nextElementSibling;
        content.classList.toggle('collapsed');
    }

    // ========== FILE UPLOAD ==========
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileSize').textContent = formatFileSize(file.size);
            document.getElementById('filePreview').classList.add('active');
            window.currentLayerData = { file: file, type: 'shapefile' };
        }
    }

    function handleGeoJSONSelect(event) {
        const file = event.target.files[0];
        if (file) {
            document.getElementById('geojsonFileName').textContent = file.name;
            document.getElementById('geojsonFileSize').textContent = formatFileSize(file.size);
            document.getElementById('geojsonFilePreview').classList.add('active');
            window.currentLayerData = { file: file, type: 'geojson' };
        }
    }

    function clearFileSelection() {
        document.getElementById('fileInput').value = '';
        document.getElementById('filePreview').classList.remove('active');
        window.currentLayerData = null;
    }

    function clearGeoJSONSelection() {
        document.getElementById('geojsonInput').value = '';
        document.getElementById('geojsonFilePreview').classList.remove('active');
        window.currentLayerData = null;
    }

    function updateDataSection() {
        const dataType = document.getElementById('dataTypeSelect').value;
        document.getElementById('shapefileSection').style.display = dataType === 'shapefile' ? 'block' : 'none';
        document.getElementById('geojsonSection').style.display = dataType === 'geojson' ? 'block' : 'none';
    }

    // ========== SHAPEFILE PROCESSING ==========
    async function processShapefile(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const geojson = await shp(arrayBuffer);
            return geojson;
        } catch (error) {
            console.error('Error processing shapefile:', error);
            showToast('Error', 'Failed to process shapefile: ' + error.message, 'error');
            return null;
        }
    }

    async function processGeoJSON(file) {
        try {
            const text = await file.text();
            const geojson = JSON.parse(text);
            return geojson;
        } catch (error) {
            console.error('Error processing GeoJSON:', error);
            showToast('Error', 'Failed to process GeoJSON: ' + error.message, 'error');
            return null;
        }
    }

    // ========== GEOJSON TO OPENLAYERS CONVERSION ==========
    function geojsonToOpenLayers(geojson) {
        const features = [];
        if (!geojson || !geojson.features) return features;

        const formatFactory = new ol.format.GeoJSON();
        
        geojson.features.forEach((feature, index) => {
            try {
                const olFeature = formatFactory.readFeature(feature, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857'
                });
                features.push(olFeature);
            } catch (e) {
                console.warn('Could not convert feature:', e);
            }
        });

        return features;
    }

    // ========== LAYER STYLING FUNCTIONS ==========
    function createStyle(color, opacity = 0.7, isHighlight = false) {
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

    function createTextStyle(text) {
        return new ol.style.Style({
            text: new ol.style.Text({
                text: text,
                font: '12px Arial, sans-serif',
                fill: new ol.style.Fill({ color: '#000' }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
                offsetY: -15
            })
        });
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // ========== ADD LAYER TO MAP ==========
    async function submitUpload() {
        if (!window.currentLayerData) {
            showToast('Error', 'Please select a file', 'error');
            return;
        }

        const layerName = document.getElementById('layerName').value || 'Untitled Layer';
        const layerColor = document.getElementById('layerColor').value;

        showToast('Processing', 'Processing file...', 'info');
        
        let geojson = null;
        if (window.currentLayerData.type === 'shapefile') {
            geojson = await processShapefile(window.currentLayerData.file);
        } else {
            geojson = await processGeoJSON(window.currentLayerData.file);
        }

        if (!geojson) {
            showToast('Error', 'Could not process file', 'error');
            return;
        }

        // Convert to OpenLayers features
        const features = geojsonToOpenLayers(geojson);
        
        if (features.length === 0) {
            showToast('Error', 'No valid features found in file', 'error');
            return;
        }

        // Create vector source and layer
        const source = new ol.source.Vector({ features: features });
        const layer = new ol.layer.Vector({
            source: source,
            style: (feature) => createStyle(layerColor, 0.7)
        });

        // Add layer to map
        map.addLayer(layer);

        // FIX 2: Auto-zoom to uploaded data extent
        const extent = source.getExtent();
        if (extent && !ol.extent.isEmpty(extent)) {
            map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 800 });
        }

        // Cache layer info
        layerCache[layerName] = {
            source: source,
            layer: layer,
            geojson: geojson,
            features: features,
            color: layerColor,
            opacity: 1.0,
            geometryType: geojson.features[0]?.geometry?.type || 'Unknown'
        };

        currentLayerName = layerName;

        // Update UI
        addLayerItem(layerName, layerColor, features.length);
        showToast('Success', `Layer "${layerName}" added with ${features.length} features`, 'success');
        
        closeModal('uploadModal');
        document.getElementById('layerName').value = '';
        clearFileSelection();
        clearGeoJSONSelection();
    }

    // ========== LAYER LIST MANAGEMENT ==========
    function addLayerItem(name, color, featureCount) {
        const layerList = document.getElementById('layerList');
        if (layerList.querySelector('.empty-state')) {
            layerList.innerHTML = '';
        }

        // FIX 3 & 4: Remove Metadata button; make Remove button full-width
        const layerHTML = `
            <div class="layer-item" onclick="selectLayer(this)">
                <input type="checkbox" class="layer-toggle" checked>
                <div class="layer-info">
                    <div class="layer-name">${name}</div>
                    <div class="layer-stats">${featureCount} features • ${layerCache[name]?.geometryType || 'Mixed'}</div>
                    <div class="layer-controls">
                        <div class="control-row">
                            <label>
                                <span>Color:</span>
                                <input type="color" class="color-picker" value="${color}" onchange="updateLayerColor(this)">
                            </label>
                        </div>
                        <div class="control-row">
                            <span>Opacity:</span>
                            <div class="transparency-control" style="flex: 1;">
                                <input type="range" class="transparency-slider" min="0" max="100" value="100" onchange="updateLayerOpacity(this)">
                            </div>
                            <span style="width: 35px; text-align: right;">100%</span>
                        </div>
                        <div class="control-row" style="margin-top: 8px;">
                            <button class="layer-action-btn danger" onclick="removeLayer(event)" title="Remove Layer" style="width:100%; justify-content:center;"><i class="fas fa-trash"></i> Remove</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        layerList.insertAdjacentHTML('beforeend', layerHTML);

        // FIX 5: Wire up checkbox for visibility toggle
        const newItem = layerList.lastElementChild;
        const checkbox = newItem.querySelector('.layer-toggle');
        checkbox.addEventListener('change', function(e) {
            e.stopPropagation();
            const cache = layerCache[name];
            if (cache && cache.layer) {
                cache.layer.setVisible(e.target.checked);
            }
        });
    }

    function selectLayer(element) {
        document.querySelectorAll('.layer-item').forEach(item => item.classList.remove('active'));
        element.classList.add('active');
        const layerName = element.querySelector('.layer-name').textContent;
        currentLayerName = layerName;
    }

    function updateLayerColor(colorPicker) {
        const newColor = colorPicker.value;
        const layerItem = colorPicker.closest('.layer-item');
        const layerName = layerItem.querySelector('.layer-name').textContent;
        
        if (layerCache[layerName]) {
            layerCache[layerName].color = newColor;
            const opacity = layerCache[layerName].opacity;
            const layer = layerCache[layerName].layer;
            
            layer.setStyle((feature) => createStyle(newColor, opacity));
            
            showToast('Color Updated', `Layer color changed to ${newColor}`, 'success', 2000);
        }
    }

    function updateLayerOpacity(slider) {
        const opacityPercent = slider.value;
        const opacityDecimal = opacityPercent / 100;
        const layerItem = slider.closest('.layer-item');
        const layerName = layerItem.querySelector('.layer-name').textContent;
        
        slider.parentElement.nextElementSibling.textContent = opacityPercent + '%';
        
        if (layerCache[layerName]) {
            layerCache[layerName].opacity = opacityDecimal;
            const color = layerCache[layerName].color;
            const layer = layerCache[layerName].layer;
            
            layer.setStyle((feature) => createStyle(color, opacityDecimal));
            
            showToast('Opacity Updated', `Layer opacity set to ${opacityPercent}%`, 'success', 2000);
        }
    }

    function viewLayerMetadata(event) {
        event.stopPropagation();
        const layerItem = event.target.closest('.layer-item');
        const layerName = layerItem.querySelector('.layer-name').textContent;
        const layerStats = layerItem.querySelector('.layer-stats').textContent;
        
        const cache = layerCache[layerName];
        let propertyKeys = [];
        
        if (cache?.geojson?.features && cache.geojson.features.length > 0) {
            propertyKeys = Object.keys(cache.geojson.features[0].properties || {});
        }

        const metadataContent = `
            <div style="padding: var(--spacing-5);">
                <h3 style="margin-bottom: var(--spacing-4); font-size: 16px; font-weight: 700;">Layer Metadata</h3>
                <div style="display: flex; flex-direction: column; gap: var(--spacing-3);">
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: var(--gray-500); text-transform: uppercase;">Layer Name</label>
                        <div style="font-size: 14px; font-weight: 600; color: var(--gray-900); margin-top: 4px;">${layerName}</div>
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: var(--gray-500); text-transform: uppercase;">Statistics</label>
                        <div style="font-size: 14px; color: var(--gray-700); margin-top: 4px;">${layerStats}</div>
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: var(--gray-500); text-transform: uppercase;">Geometry Type</label>
                        <div style="font-size: 14px; color: var(--gray-700); margin-top: 4px;">${cache?.geometryType || 'Unknown'}</div>
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: var(--gray-500); text-transform: uppercase;">Properties</label>
                        <div style="font-size: 14px; color: var(--gray-700); margin-top: 4px;">${propertyKeys.join(', ') || 'None'}</div>
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: var(--gray-500); text-transform: uppercase;">Source</label>
                        <div style="font-size: 14px; color: var(--gray-700); margin-top: 4px;">Uploaded Geospatial Data</div>
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600; color: var(--gray-500); text-transform: uppercase;">Status</label>
                        <div style="font-size: 14px; color: var(--green-500); margin-top: 4px; font-weight: 600;">✓ Active</div>
                    </div>
                </div>
                <button onclick="closeModal('metadataModal')" style="margin-top: var(--spacing-5); width: 100%; padding: var(--spacing-3); background: var(--accent); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Close</button>
            </div>
        `;
        
        let modal = document.getElementById('metadataModal');
        if (!modal) {
            const modalHTML = `
                <div class="modal-overlay" id="metadataModalOverlay" onclick="if(event.target===this) closeModal('metadataModal')">
                    <div class="modal" id="metadataModal" style="max-width: 400px;">
                        ${metadataContent}
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('metadataModal');
        } else {
            modal.innerHTML = metadataContent;
        }
        
        openModal('metadataModal');
    }

    function removeLayer(event) {
        event.stopPropagation();
        const layerItem = event.target.closest('.layer-item');
        const layerName = layerItem.querySelector('.layer-name').textContent;
        
        if (layerCache[layerName]) {
            map.removeLayer(layerCache[layerName].layer);
            delete layerCache[layerName];
        }
        
        layerItem.remove();
        
        const layerList = document.getElementById('layerList');
        if (layerList.children.length === 0) {
            layerList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-folder-open"></i></div>
                    <div class="empty-state-text">No layers loaded yet. Upload shapefiles to get started.</div>
                </div>
            `;
            currentLayerName = null;
        }
        
        showToast('Layer Removed', `${layerName} has been removed from the map`, 'info', 2000);
    }

    // ========== ATTRIBUTE TABLE ==========
    function openAttributeTable() {
        const activeLayer = document.querySelector('.layer-item.active');
        if (!activeLayer) {
            showToast('No Layer', 'Please select a layer first', 'warning', 2000);
            return;
        }

        const layerName = activeLayer.querySelector('.layer-name').textContent;
        const cache = layerCache[layerName];
        
        if (!cache || !cache.geojson || !cache.geojson.features) {
            showToast('Error', 'Layer has no features', 'error');
            return;
        }

        const features = cache.geojson.features;
        if (features.length === 0) {
            showToast('Error', 'No features to display', 'error');
            return;
        }

        // Get all property keys
        const propertyKeys = new Set();
        features.forEach(feature => {
            if (feature.properties) {
                Object.keys(feature.properties).forEach(key => propertyKeys.add(key));
            }
        });
        const keys = Array.from(propertyKeys);

        let tableHTML = '<table id="attributeTable" style="width: 100%; border-collapse: collapse; font-size: 12px;">';
        tableHTML += '<thead><tr style="background: var(--gray-100); border-bottom: 2px solid var(--gray-300); position: sticky; top: 0;">';
        
        keys.forEach(key => {
            tableHTML += `<th style="padding: 10px; text-align: left; font-weight: 700; color: var(--gray-700);">${key}</th>`;
        });
        tableHTML += '</tr></thead><tbody>';

        features.forEach((feature, idx) => {
            tableHTML += `<tr class="attribute-row" data-row-index="${idx}" style="border-bottom: 1px solid var(--gray-200); background: ${idx % 2 === 0 ? 'white' : 'var(--gray-50)'}; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='var(--blue-50)'" onmouseout="this.style.background='${idx % 2 === 0 ? 'white' : 'var(--gray-50)'}'">`;
            
            keys.forEach(key => {
                const value = feature.properties?.[key] || '';
                tableHTML += `<td style="padding: 10px; color: var(--gray-700);" class="attr-cell">${String(value)}</td>`;
            });
            
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table>';

        const container = document.getElementById('attributeTableContainer');
        container.dataset.totalRows = features.length;
        container.innerHTML = tableHTML;

        // Setup search functionality
        const searchInput = document.querySelector('#attributesModal .form-group input[type="text"]');
        if (searchInput) {
            searchInput.value = '';
            searchInput.oninput = (e) => {
                const query = e.target.value.toLowerCase();
                let visibleCount = 0;
                
                document.querySelectorAll('#attributeTable tbody tr.attribute-row').forEach(row => {
                    let matches = false;
                    row.querySelectorAll('.attr-cell').forEach(cell => {
                        if (cell.textContent.toLowerCase().includes(query)) {
                            matches = true;
                        }
                    });
                    
                    row.style.display = matches ? '' : 'none';
                    if (matches) visibleCount++;
                });
                
                if (query.length > 0) {
                    showToast('Search', `Found ${visibleCount} matching records`, 'info', 1500);
                }
            };
        }

        openModal('attributesModal');
        showToast('Attributes', `Showing ${features.length} features for "${layerName}"`, 'info', 1500);
    }

    // ========== ANNOTATION TOOLS ==========
    let selectedAnnotationMode = null;

    function activateAnnotation(type) {
        if (type === 'text') {
            selectedAnnotationMode = 'text';
            annotationMode = true;
            showToast('Text Annotation', 'Click on the map to place a text annotation', 'info');
            
            annotationClickListener = (e) => {
                const coordinates = e.coordinate;
                const popup = document.getElementById('annotationPopup');
                const pixel = map.getPixelFromCoordinate(coordinates);
                popup.style.left = (pixel[0] + 10) + 'px';
                popup.style.top = (pixel[1] - 50) + 'px';
                popup.classList.add('active');
                
                document.getElementById('annotationInput').focus();
                document.getElementById('annotationInput').dataset.x = coordinates[0];
                document.getElementById('annotationInput').dataset.y = coordinates[1];
                
                map.un('click', annotationClickListener);
            };
            
            map.on('click', annotationClickListener);
        } else if (type === 'highlight') {
            selectedAnnotationMode = 'highlight';
            showToast('Feature Highlight', 'Click on a feature to highlight it', 'info');
            map.getViewport().style.cursor = 'pointer';
        }
    }

    function submitAnnotation() {
        const text = document.getElementById('annotationInput').value.trim();
        const x = parseFloat(document.getElementById('annotationInput').dataset.x);
        const y = parseFloat(document.getElementById('annotationInput').dataset.y);
        const fontSize = parseInt(document.getElementById('annotationFontSize').value) || 12;
        const fontColor = document.getElementById('annotationFontColor').value || '#000000';
        
        if (!text) {
            showToast('Annotation Required', 'Please enter some text', 'warning');
            return;
        }
        
        // Create text feature with font properties
        const feature = new ol.Feature({
            geometry: new ol.geom.Point([x, y]),
            text: text,
            fontSize: fontSize,
            fontColor: fontColor,
            isAnnotation: true,
            isDragging: false
        });

        // Create text layer if it doesn't exist
        if (!layerCache['_annotations']) {
            const source = new ol.source.Vector();
            const layer = new ol.layer.Vector({
                source: source,
                style: (feature) => {
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
                                text: text,
                                font: `bold ${fontSize}px Arial, sans-serif`,
                                fill: new ol.style.Fill({ color: fontColor }),
                                stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
                                offsetY: -15
                            })
                        })
                    ];
                }
            });
            map.addLayer(layer);
            layerCache['_annotations'] = { source: source, layer: layer };
        }

        layerCache['_annotations'].source.addFeature(feature);
        
        // FIX: Reset annotationMode and annotationClickListener to allow editing/deleting/moving
        annotationMode = false;
        selectedAnnotationMode = null;
        if (annotationClickListener) {
            map.un('click', annotationClickListener);
            annotationClickListener = null;
        }
        
        document.getElementById('annotationPopup').classList.remove('active');
        document.getElementById('annotationInput').value = '';
        delete document.getElementById('annotationInput').dataset.x;
        delete document.getElementById('annotationInput').dataset.y;
        
        showToast('Success', 'Text annotation added. Click to select, edit, or delete.', 'success');
    }

    function cancelAnnotation() {
        document.getElementById('annotationPopup').classList.remove('active');
        document.getElementById('annotationInput').value = '';
        delete document.getElementById('annotationInput').dataset.x;
        delete document.getElementById('annotationInput').dataset.y;
        
        // Reset annotation mode flags
        annotationMode = false;
        selectedAnnotationMode = null;
        
        if (annotationClickListener) {
            map.un('click', annotationClickListener);
            annotationClickListener = null;
        }
    }

    // ========== ANNOTATION DELETION ==========
    let selectedAnnotation = null;
    let deleteAnnotationBtn = null;
    let annotationActionMenu = null;

    function editAnnotation(feature) {
        if (!feature) return;
        const text = feature.get('text');
        const fontSize = feature.get('fontSize') || 12;
        const fontColor = feature.get('fontColor') || '#000000';
        
        // Open edit popup
        const editPopup = document.createElement('div');
        editPopup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            z-index: 10001;
            min-width: 300px;
        `;
        editPopup.innerHTML = `
            <div style="font-weight: 700; margin-bottom: 15px; font-size: 14px;">Edit Annotation</div>
            <div style="margin-bottom: 10px;">
                <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px;">Text</label>
                <textarea id="editAnnotationText" style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px; font-family: Arial; font-size: 13px; min-height: 60px; resize: vertical;">${text}</textarea>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <div>
                    <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px;">Font Size</label>
                    <input type="number" id="editAnnotationFontSize" min="8" max="48" value="${fontSize}" style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px; font-size: 13px;">
                </div>
                <div>
                    <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px;">Color</label>
                    <input type="color" id="editAnnotationFontColor" value="${fontColor}" style="width: 100%; height: 36px; padding: 4px; border: 1px solid var(--gray-300); border-radius: 6px; cursor: pointer;">
                </div>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="editCancelBtn" style="padding: 8px 16px; background: var(--gray-200); border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">Cancel</button>
                <button id="editSaveBtn" style="padding: 8px 16px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">Save</button>
            </div>
        `;
        
        document.body.appendChild(editPopup);
        
        const backdrop = document.createElement('div');
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.3);
            z-index: 10000;
        `;
        document.body.insertBefore(backdrop, editPopup);
        
        document.getElementById('editSaveBtn').onclick = () => {
            const newText = document.getElementById('editAnnotationText').value.trim();
            const newFontSize = parseInt(document.getElementById('editAnnotationFontSize').value) || 12;
            const newFontColor = document.getElementById('editAnnotationFontColor').value;
            
            if (!newText) {
                showToast('Error', 'Text cannot be empty', 'error');
                return;
            }
            
            feature.set('text', newText);
            feature.set('fontSize', newFontSize);
            feature.set('fontColor', newFontColor);
            
            // Trigger style update
            layerCache['_annotations'].layer.changed();
            
            backdrop.remove();
            editPopup.remove();
            showToast('Success', 'Annotation updated', 'success', 1500);
        };
        
        document.getElementById('editCancelBtn').onclick = () => {
            backdrop.remove();
            editPopup.remove();
        };
    }

    function deleteAnnotation(feature) {
        if (!layerCache['_annotations']) return;
        
        const source = layerCache['_annotations'].source;
        source.removeFeature(feature);
        selectedAnnotation = null;
        if (deleteAnnotationBtn && deleteAnnotationBtn.parentElement) {
            deleteAnnotationBtn.remove();
            deleteAnnotationBtn = null;
        }
        if (annotationActionMenu && annotationActionMenu.parentElement) {
            annotationActionMenu.remove();
            annotationActionMenu = null;
        }
        showToast('Removed', 'Annotation deleted', 'info', 1500);
        
        // If no more annotations, remove layer
        if (source.getFeatures().length === 0) {
            map.removeLayer(layerCache['_annotations'].layer);
            delete layerCache['_annotations'];
        }
    }

    function selectAnnotationForDeletion(e) {
        // Only run when NOT in text annotation placement mode
        if (annotationMode) return;

        const hitFeatures = [];
        map.forEachFeatureAtPixel(e.pixel, function(feature) {
            if (feature.get('isAnnotation')) {
                hitFeatures.push(feature);
            }
        });

        // Clear previous selection visually
        if (selectedAnnotation) {
            selectedAnnotation.set('selected', false);
        }
        if (deleteAnnotationBtn && deleteAnnotationBtn.parentElement) {
            deleteAnnotationBtn.remove();
            deleteAnnotationBtn = null;
        }
        if (annotationActionMenu && annotationActionMenu.parentElement) {
            annotationActionMenu.remove();
            annotationActionMenu = null;
        }

        if (hitFeatures.length > 0) {
            selectedAnnotation = hitFeatures[0];
            selectedAnnotation.set('selected', true);

            // Show action menu near the annotation
            const pixel = map.getPixelFromCoordinate(selectedAnnotation.getGeometry().getCoordinates());
            const mapRect = document.getElementById('mapContainer').getBoundingClientRect();

            annotationActionMenu = document.createElement('div');
            annotationActionMenu.style.cssText = `
                position: fixed;
                left: ${mapRect.left + pixel[0] + 12}px;
                top: ${mapRect.top + pixel[1] - 100}px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 9999;
                overflow: hidden;
                min-width: 160px;
            `;
            annotationActionMenu.innerHTML = `
                <button style="width: 100%; padding: 10px 12px; background: none; border: none; text-align: left; cursor: pointer; font-size: 12px; font-weight: 600; color: var(--gray-700); transition: background 0.2s; border-bottom: 1px solid var(--gray-100);" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='none'" onclick="editAnnotation(selectedAnnotation); this.parentElement.remove(); annotationActionMenu = null;">
                    <i class="fas fa-edit" style="margin-right: 8px; color: var(--accent);"></i> Edit
                </button>
                <button style="width: 100%; padding: 10px 12px; background: none; border: none; text-align: left; cursor: pointer; font-size: 12px; font-weight: 600; color: var(--gray-700); transition: background 0.2s;" onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background='none'" onclick="deleteAnnotation(selectedAnnotation); this.parentElement.remove(); annotationActionMenu = null;">
                    <i class="fas fa-trash" style="margin-right: 8px; color: #dc2626;"></i> Delete
                </button>
            `;
            document.body.appendChild(annotationActionMenu);

            // Auto-hide after 6 seconds
            setTimeout(() => {
                if (annotationActionMenu && annotationActionMenu.parentElement) {
                    annotationActionMenu.remove();
                    annotationActionMenu = null;
                    if (selectedAnnotation) {
                        selectedAnnotation.set('selected', false);
                        selectedAnnotation = null;
                    }
                }
            }, 6000);
        } else {
            selectedAnnotation = null;
        }
    }

    // ========== WMS LAYER MANAGEMENT ==========
    function addWMSLayer() {
        const wmsUrl = document.getElementById('wmsUrl').value.trim();
        const wmsLayerName = document.getElementById('wmsLayerName').value.trim();
        const wmsDisplayName = document.getElementById('wmsDisplayName').value.trim() || wmsLayerName;

        if (!wmsUrl || !wmsLayerName) {
            showToast('Error', 'Please enter both WMS URL and Layer Name', 'error');
            return;
        }

        try {
            showToast('Loading', 'Adding WMS layer...', 'info');

            // Parse URL to extract base URL without query params
            let baseUrl = wmsUrl.includes('?') ? wmsUrl.split('?')[0] : wmsUrl;
            
            // Ensure URL ends with /
            if (!baseUrl.endsWith('/')) {
                baseUrl += '/';
            }

            // Create WMS source with proper configuration
            const source = new ol.source.TileWMS({
                url: baseUrl,
                params: {
                    'LAYERS': wmsLayerName,
                    'TILED': true,
                    'VERSION': '1.1.1'
                },
                serverType: 'geoserver',
                crossOrigin: 'anonymous',
                transition: 0
            });

            // Create WMS layer
            const layer = new ol.layer.Tile({
                source: source,
                visible: true,
                zIndex: 100
            });

            // Add layer to map
            map.addLayer(layer);

            // Cache layer info
            layerCache[wmsDisplayName] = {
                source: source,
                layer: layer,
                geojson: null,
                features: [],
                color: '#2563eb',
                opacity: 1.0,
                geometryType: 'WMS',
                isWMS: true
            };

            currentLayerName = wmsDisplayName;

            // Update UI - add to layer list
            const layerList = document.getElementById('layerList');
            if (layerList.querySelector('.empty-state')) {
                layerList.innerHTML = '';
            }

            const layerHTML = `
                <div class="layer-item" onclick="selectLayer(this)">
                    <input type="checkbox" class="layer-toggle" checked>
                    <div class="layer-info">
                        <div class="layer-name">${wmsDisplayName}</div>
                        <div class="layer-stats">WMS Layer • Remote</div>
                        <div class="layer-controls">
                            <div class="control-row">
                                <span>Opacity:</span>
                                <div class="transparency-control" style="flex: 1;">
                                    <input type="range" class="transparency-slider" min="0" max="100" value="100" onchange="updateLayerOpacity(this)">
                                </div>
                                <span style="width: 35px; text-align: right;">100%</span>
                            </div>
                            <div class="control-row" style="margin-top: 8px;">
                                <button class="layer-action-btn danger" onclick="removeLayer(event)" title="Remove Layer" style="width:100%; justify-content:center;"><i class="fas fa-trash"></i> Remove</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            layerList.insertAdjacentHTML('beforeend', layerHTML);

            // Wire visibility checkbox for WMS layer
            const newItem = layerList.lastElementChild;
            const checkbox = newItem.querySelector('.layer-toggle');
            const wmsLayerRef = layer;
            checkbox.addEventListener('change', function(e) {
                e.stopPropagation();
                wmsLayerRef.setVisible(e.target.checked);
            });

            // Clear form and close modal
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

    // ========== MAP INITIALIZATION ==========
    let draggedAnnotation = null;
    
    function initMap() {
        const rasterLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://basemapserver.geoportal.gov.ph/tiles/v2/PGP/{z}/{x}/{y}.png',
                attributions: '© NAMRIA'
            })
        });

        // FIX 1: Remove OL default zoom control; keep only custom zoom buttons
        // Build controls collection without the zoom control (works with OL v8 UMD bundle)
        let mapControls;
        try {
            mapControls = ol.control.defaults({ zoom: false });
        } catch(e) {
            // Fallback: empty collection, add attribution manually
            mapControls = new ol.Collection([new ol.control.Attribution()]);
        }

        map = new ol.Map({
            target: 'mapContainer',
            layers: [rasterLayer],
            controls: mapControls,
            view: new ol.View({
                center: ol.proj.fromLonLat([121.7740, 12.8797]),
                zoom: 6,
                projection: 'EPSG:3857'
            })
        });

        // Add scale bar control
        const scaleControl = new ol.control.ScaleLine({
            units: 'metric',
            bar: true,
            steps: 4,
            text: true
        });
        map.addControl(scaleControl);

        // Extra safety: remove any built-in OL zoom control that may still exist
        map.getControls().forEach(function(control) {
            if (control instanceof ol.control.Zoom) {
                map.removeControl(control);
            }
        });

        // Setup zoom controls
        document.getElementById('zoomIn').addEventListener('click', () => {
            const view = map.getView();
            view.setZoom(view.getZoom() + 1);
        });

        document.getElementById('zoomOut').addEventListener('click', () => {
            const view = map.getView();
            view.setZoom(view.getZoom() - 1);
        });

        // Map settings toggles
        document.getElementById('labelsToggle').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            map.getLayers().forEach(layer => {
                if (layer instanceof ol.layer.Vector) {
                    layer.setStyle((feature) => {
                        const styles = [];
                        const layerName = Object.keys(layerCache).find(name => layerCache[name].layer === layer);
                        
                        if (layerName) {
                            const cache = layerCache[layerName];
                            styles.push(createStyle(cache.color, cache.opacity));
                            
                            if (isChecked) {
                                const propKeys = Object.keys(feature.getProperties());
                                const firstProp = propKeys.find(k => typeof feature.get(k) === 'string' && feature.get(k).length < 50);
                                if (firstProp) {
                                    styles.push(createTextStyle(feature.get(firstProp)));
                                }
                            }
                        }
                        return styles;
                    });
                }
            });
            showToast('Labels', isChecked ? 'Layer labels shown' : 'Layer labels hidden', 'info', 1500);
        });

        document.getElementById('scaleBarToggle').addEventListener('change', (e) => {
            if (e.target.checked) {
                scaleControl.setMap(map);
                showToast('Scale Bar', 'Scale bar shown', 'info', 1500);
            } else {
                scaleControl.setMap(null);
                showToast('Scale Bar', 'Scale bar hidden', 'info', 1500);
            }
        });

        document.getElementById('northArrowToggle').addEventListener('change', (e) => {
            const northArrow = document.querySelector('.north-arrow');
            if (e.target.checked) {
                northArrow.classList.remove('hidden');
                showToast('North Arrow', 'North arrow shown', 'info', 1500);
            } else {
                northArrow.classList.add('hidden');
                showToast('North Arrow', 'North arrow hidden', 'info', 1500);
            }
        });

        // Feature interaction for highlighting
        const select = new ol.interaction.Select({
            condition: ol.events.condition.click
        });

        select.on('change:name', function() {
            const selectedFeatures = select.getFeatures();
            
            map.getLayers().forEach(layer => {
                if (layer instanceof ol.layer.Vector) {
                    const layerName = Object.keys(layerCache).find(name => layerCache[name].layer === layer);
                    
                    if (selectedAnnotationMode === 'highlight' && layerName && layerName !== '_annotations') {
                        const cache = layerCache[layerName];
                        layer.setStyle((feature) => {
                            const isSelected = selectedFeatures.getArray().includes(feature);
                            if (isSelected) {
                                return createStyle(cache.color, cache.opacity, true);
                            }
                            return createStyle(cache.color, cache.opacity, false);
                        });
                    }
                }
            });
        });

        map.addInteraction(select);

        // Add drag-to-move interaction for annotations
        map.on('pointerdown', function(e) {
            if (selectedAnnotation && selectedAnnotation.get('isAnnotation')) {
                draggedAnnotation = selectedAnnotation;
                map.getViewport().style.cursor = 'grabbing';
            }
        });

        map.on('pointermove', function(e) {
            if (draggedAnnotation) {
                draggedAnnotation.getGeometry().setCoordinates(e.coordinate);
            }
        });

        map.on('pointerup', function(e) {
            if (draggedAnnotation) {
                draggedAnnotation = null;
                map.getViewport().style.cursor = 'default';
                showToast('Moved', 'Annotation moved to new location', 'success', 1200);
            }
        });

        // Wire annotation click-to-delete on map click
        map.on('click', function(e) {
            selectAnnotationForDeletion(e);
        });
    }

    function changeBasemap(basemapName) {
        const layers = map.getLayers().getArray();
        const basemapLayer = layers[0];
        
        if (basemapLayer) {
            map.removeLayer(basemapLayer);
        }

        let source;
        switch(basemapName) {
            case 'namria':
                source = new ol.source.XYZ({
                    url: 'https://basemapserver.geoportal.gov.ph/tiles/v2/PGP/{z}/{x}/{y}.png',
                    attributions: '© NAMRIA'
                });
                break;
            case 'osm':
                source = new ol.source.OSM();
                break;
            case 'google':
                // Replaced with ESRI World Imagery due to tile restrictions
                source = new ol.source.XYZ({
                    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    attributions: '© Esri'
                });
                break;
            case 'bing':
                source = new ol.source.XYZ({
                    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
                });
                break;
            case 'stamen-terrain':
                source = new ol.source.XYZ({
                    url: 'https://tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png'
                });
                break;
            case 'esri-satellite':
                source = new ol.source.XYZ({
                    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    attributions: '© Esri'
                });
                break;
            default:
                source = new ol.source.XYZ({
                    url: 'https://basemapserver.geoportal.gov.ph/tiles/v2/PGP/{z}/{x}/{y}.png',
                    attributions: '© NAMRIA'
                });
        }

        const newLayer = new ol.layer.Tile({ source: source });
        map.getLayers().insertAt(0, newLayer);
    }

    // ========== EXPORT & SHARE ==========
    function renderMapPreview() {
        const canvas = document.getElementById('mapPreviewCanvas');
        const placeholder = document.getElementById('mapPreviewPlaceholder');
        
        if (!canvas || !map) return;
        
        // Get the current map canvas
        const mapCanvas = document.querySelector('.ol-unselectable canvas');
        if (!mapCanvas) return;
        
        // Set canvas dimensions to match map
        canvas.width = 600;
        canvas.height = 200;
        
        const ctx = canvas.getContext('2d');
        
        // Draw background
        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw a scaled version of the current map view
        try {
            const extent = map.getView().calculateExtent(map.getSize());
            const source = mapCanvas.getContext('2d');
            
            // Draw the map content with proper scaling
            const scale = canvas.width / map.getSize()[0];
            ctx.scale(scale, scale);
            ctx.drawImage(mapCanvas, 0, 0);
            ctx.scale(1/scale, 1/scale);
            
            canvas.style.display = 'block';
            placeholder.style.display = 'none';
        } catch(e) {
            // Fallback: just show placeholder if something goes wrong
            console.warn('Could not render map preview:', e);
        }
    }

    function downloadMap() {
        const format = document.getElementById('exportFormat').value;
        const resolution = document.getElementById('exportResolution').value;
        const [width, height] = resolution.split('x').map(Number);
        
        try {
            showToast('Exporting', 'Generating map export...', 'info');
            
            // Create a canvas to render the map at the specified resolution
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Failed to get canvas context');
            }
            
            // Fill with white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            
            // Get the current map canvas
            const mapCanvas = document.querySelector('.ol-unselectable canvas');
            if (mapCanvas) {
                try {
                    const scale = width / map.getSize()[0];
                    ctx.save();
                    ctx.scale(scale, scale);
                    ctx.drawImage(mapCanvas, 0, 0);
                    ctx.restore();
                } catch(e) {
                    console.warn('Could not draw map canvas:', e);
                }
            }
            
            // Add title and timestamp
            ctx.fillStyle = '#333333';
            ctx.font = 'bold 18px Arial';
            ctx.fillText('Geoportal Philippines Map', 20, 30);
            ctx.font = '12px Arial';
            ctx.fillStyle = '#666666';
            const timestamp = new Date().toLocaleString();
            ctx.fillText(`Exported: ${timestamp}`, 20, 50);
            
            // Generate download based on format
            if (format === 'png') {
                canvas.toBlob(function(blob) {
                    if (!blob) {
                        showToast('Error', 'Failed to create PNG blob', 'error');
                        return;
                    }
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `map_export_${Date.now()}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    showToast('Success', 'Map exported as PNG', 'success');
                    closeModal('exportModal');
                }, 'image/png');
            } else if (format === 'jpeg') {
                canvas.toBlob(function(blob) {
                    if (!blob) {
                        showToast('Error', 'Failed to create JPEG blob', 'error');
                        return;
                    }
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `map_export_${Date.now()}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    showToast('Success', 'Map exported as JPEG', 'success');
                    closeModal('exportModal');
                }, 'image/jpeg', 0.95);
            } else if (format === 'pdf') {
                // For PDF, we'll use a simple approach - download as PNG
                canvas.toBlob(function(blob) {
                    if (!blob) {
                        showToast('Error', 'Failed to create image blob', 'error');
                        return;
                    }
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `map_export_${Date.now()}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    showToast('Info', 'PDF export downloads as high-resolution PNG', 'info');
                    closeModal('exportModal');
                }, 'image/png');
            }
        } catch (error) {
            console.error('Export error:', error);
            showToast('Error', 'Failed to export map: ' + error.message, 'error');
        }
    }

    function copyToClipboard() {
        const input = event.target.previousElementSibling;
        input.select();
        document.execCommand('copy');
        event.target.innerHTML = '<i class="fas fa-check"></i> Copied';
        setTimeout(() => {
            event.target.innerHTML = '<i class="fas fa-copy"></i> Copy';
        }, 2000);
    }

    function generateLink() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let link = '';
        for (let i = 0; i < 8; i++) {
            link += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        document.querySelector('#shareModal input').value = `geoportal.gov.ph/map/${link}`;
        showToast('Generated', 'New share link created', 'success', 2000);
    }

    // ========== INITIALIZATION ==========
    initMap();

    // Close annotation popup when clicking outside
    document.addEventListener('click', (e) => {
        const popup = document.getElementById('annotationPopup');
        if (!popup.contains(e.target) && !document.getElementById('mapContainer').contains(e.target)) {
            if (popup.classList.contains('active')) {
                cancelAnnotation();
            }
        }
    });

    // Expose global functions for onclick handlers in HTML
    window.showToast = showToast;
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.toggleSection = toggleSection;
    window.handleFileSelect = handleFileSelect;
    window.handleGeoJSONSelect = handleGeoJSONSelect;
    window.clearFileSelection = clearFileSelection;
    window.clearGeoJSONSelection = clearGeoJSONSelection;
    window.updateDataSection = updateDataSection;
    window.submitUpload = submitUpload;
    window.selectLayer = selectLayer;
    window.updateLayerColor = updateLayerColor;
    window.updateLayerOpacity = updateLayerOpacity;
    window.removeLayer = removeLayer;
    window.openAttributeTable = openAttributeTable;
    window.activateAnnotation = activateAnnotation;
    window.submitAnnotation = submitAnnotation;
    window.cancelAnnotation = cancelAnnotation;
    window.editAnnotation = editAnnotation;
    window.deleteAnnotation = deleteAnnotation;
    window.changeBasemap = changeBasemap;
    window.addWMSLayer = addWMSLayer;
    window.downloadMap = downloadMap;
    window.renderMapPreview = renderMapPreview;
    window.copyToClipboard = copyToClipboard;
    window.generateLink = generateLink;
});



