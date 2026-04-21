import { getMap } from '../state/store.js';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../config/defaults.js';
import { applyLabelsVisibility, syncLabelsToggle } from '../tools/labels-tool.js';
import ol from '../lib/ol.js';

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
    syncLabelsToggle();

    const resetViewBtn = document.getElementById('resetView');

    document.getElementById('zoomIn').addEventListener('click', () => {
        const view = getMap().getView();
        view.setZoom(view.getZoom() + 1);
    });

    document.getElementById('zoomOut').addEventListener('click', () => {
        const view = getMap().getView();
        view.setZoom(view.getZoom() - 1);
    });

    resetViewBtn?.addEventListener('click', () => {
        const view = getMap().getView();
        view.animate({
            center: ol.proj.fromLonLat(DEFAULT_MAP_CENTER),
            zoom: DEFAULT_MAP_ZOOM,
            rotation: 0,
            duration: 350
        });
    });

    document.getElementById('labelsToggle').addEventListener('change', (event) => {
        applyLabelsVisibility(event.target.checked);
    });

    document.getElementById('scaleBarToggle').addEventListener('change', (event) => {
        if (event.target.checked) {
            scaleControl.setMap(getMap());
            return;
        }

        scaleControl.setMap(null);
    });

    document.getElementById('northArrowToggle').addEventListener('change', (event) => {
        const northArrow = document.querySelector('.north-arrow');
        if (event.target.checked) {
            northArrow.classList.remove('hidden');
            return;
        }

        northArrow.classList.add('hidden');
    });

    return scaleControl;
}
