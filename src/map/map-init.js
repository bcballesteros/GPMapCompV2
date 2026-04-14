import { createBasemapLayer } from '../config/basemaps.js';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_PROJECTION, DEFAULT_MAP_ZOOM } from '../config/defaults.js';
import ol from '../lib/ol.js';
import { setMap } from '../state/store.js';
import { setupMapControls } from './controls.js';
import { setupMapInteractions } from './interactions.js';

function createMapControls() {
    try {
        return ol.control.defaults({ zoom: false });
    } catch (error) {
        return new ol.Collection([new ol.control.Attribution()]);
    }
}

export function initializeMap(interactionHandlers) {
    const map = new ol.Map({
        target: 'mapContainer',
        layers: [createBasemapLayer('namria')],
        controls: createMapControls(),
        view: new ol.View({
            center: ol.proj.fromLonLat(DEFAULT_MAP_CENTER),
            zoom: DEFAULT_MAP_ZOOM,
            projection: DEFAULT_MAP_PROJECTION
        })
    });

    setMap(map);
    setupMapControls(map);
    setupMapInteractions(interactionHandlers);

    return map;
}
