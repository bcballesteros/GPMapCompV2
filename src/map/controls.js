import { getMap } from '../state/store.js';
import { showToast } from '../ui/toast.js';
import { applyLabelsVisibility } from '../tools/labels-tool.js';

function createScaleControl() {
    return new ol.control.ScaleLine({
        units: 'metric',
        bar: true,
        steps: 4,
        text: true
    });
}

function removeDefaultZoomControl(map) {
    map.getControls().forEach((control) => {
        if (control instanceof ol.control.Zoom) {
            map.removeControl(control);
        }
    });
}

export function setupMapControls(map) {
    const scaleControl = createScaleControl();
    map.addControl(scaleControl);
    removeDefaultZoomControl(map);

    document.getElementById('zoomIn').addEventListener('click', () => {
        const view = getMap().getView();
        view.setZoom(view.getZoom() + 1);
    });

    document.getElementById('zoomOut').addEventListener('click', () => {
        const view = getMap().getView();
        view.setZoom(view.getZoom() - 1);
    });

    document.getElementById('labelsToggle').addEventListener('change', (event) => {
        applyLabelsVisibility(event.target.checked);
    });

    document.getElementById('scaleBarToggle').addEventListener('change', (event) => {
        if (event.target.checked) {
            scaleControl.setMap(getMap());
            showToast('Scale Bar', 'Scale bar shown', 'info', 1500);
            return;
        }

        scaleControl.setMap(null);
        showToast('Scale Bar', 'Scale bar hidden', 'info', 1500);
    });

    document.getElementById('northArrowToggle').addEventListener('change', (event) => {
        const northArrow = document.querySelector('.north-arrow');
        if (event.target.checked) {
            northArrow.classList.remove('hidden');
            showToast('North Arrow', 'North arrow shown', 'info', 1500);
            return;
        }

        northArrow.classList.add('hidden');
        showToast('North Arrow', 'North arrow hidden', 'info', 1500);
    });

    return scaleControl;
}
