import { createExportCanvas, downloadCanvas } from '../services/export-service.js';
import { getMap } from '../state/store.js';
import { randomToken } from '../utils/format.js';
import { closeModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

export function renderMapPreview() {
    const canvas = document.getElementById('mapPreviewCanvas');
    const placeholder = document.getElementById('mapPreviewPlaceholder');

    if (!canvas || !getMap()) {
        return;
    }

    const mapCanvas = document.querySelector('.ol-unselectable canvas');
    if (!mapCanvas) {
        return;
    }

    canvas.width = 600;
    canvas.height = 200;

    const context = canvas.getContext('2d');
    context.fillStyle = '#f3f4f6';
    context.fillRect(0, 0, canvas.width, canvas.height);

    try {
        const scale = canvas.width / getMap().getSize()[0];
        context.scale(scale, scale);
        context.drawImage(mapCanvas, 0, 0);
        context.scale(1 / scale, 1 / scale);

        canvas.style.display = 'block';
        placeholder.style.display = 'none';
    } catch (error) {
        console.warn('Could not render map preview:', error);
    }
}

export function downloadMap() {
    const format = document.getElementById('exportFormat').value;
    const resolution = document.getElementById('exportResolution').value;
    const [width, height] = resolution.split('x').map(Number);

    try {
        showToast('Exporting', 'Generating map export...', 'info');

        const canvas = createExportCanvas(width, height);

        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to get canvas context');
        }

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);

        const mapCanvas = document.querySelector('.ol-unselectable canvas');
        if (mapCanvas) {
            try {
                const scale = width / getMap().getSize()[0];
                context.save();
                context.scale(scale, scale);
                context.drawImage(mapCanvas, 0, 0);
                context.restore();
            } catch (error) {
                console.warn('Could not draw map canvas:', error);
            }
        }

        context.fillStyle = '#333333';
        context.font = 'bold 18px Arial';
        context.fillText('Geoportal Philippines Map', 20, 30);
        context.font = '12px Arial';
        context.fillStyle = '#666666';
        context.fillText(`Exported: ${new Date().toLocaleString()}`, 20, 50);

        if (format === 'png') {
            downloadCanvas(canvas, 'image/png', `map_export_${Date.now()}.png`, undefined, (blob) => {
                if (!blob) {
                    showToast('Error', 'Failed to create image/png blob', 'error');
                    return;
                }

                showToast('Success', 'Map exported as PNG', 'success');
                closeModal('exportModal');
            });
            return;
        }

        if (format === 'jpeg') {
            downloadCanvas(canvas, 'image/jpeg', `map_export_${Date.now()}.jpg`, 0.95, (blob) => {
                if (!blob) {
                    showToast('Error', 'Failed to create image/jpeg blob', 'error');
                    return;
                }

                showToast('Success', 'Map exported as JPEG', 'success');
                closeModal('exportModal');
            });
            return;
        }

        downloadCanvas(canvas, 'image/png', `map_export_${Date.now()}.png`, undefined, (blob) => {
            if (!blob) {
                showToast('Error', 'Failed to create image/png blob', 'error');
                return;
            }

            showToast('Info', 'PDF export downloads as high-resolution PNG', 'info');
            closeModal('exportModal');
        });
    } catch (error) {
        console.error('Export error:', error);
        showToast('Error', `Failed to export map: ${error.message}`, 'error');
    }
}

export function copyToClipboard() {
    const clickEvent = window.event;
    const input = clickEvent?.target?.previousElementSibling;

    if (!input) {
        return;
    }

    input.select();
    document.execCommand('copy');
    clickEvent.target.innerHTML = '<i class="fas fa-check"></i> Copied';

    setTimeout(() => {
        clickEvent.target.innerHTML = '<i class="fas fa-copy"></i> Copy';
    }, 2000);
}

export function generateLink() {
    document.querySelector('#shareModal input').value = `geoportal.gov.ph/map/${randomToken()}`;
    showToast('Generated', 'New share link created', 'success', 2000);
}
