import { DEFAULT_VIEW_PADDING } from '../config/defaults.js';
import ol from '../lib/ol.js';
import { searchLocations } from '../services/geocoding-service.js';
import { getMap, setCurrentSearchResult } from '../state/store.js';
import { showToast } from './toast.js';

const SEARCH_MARKER_SOURCE = new ol.source.Vector();
const SEARCH_MARKER_LAYER = new ol.layer.Vector({
    source: SEARCH_MARKER_SOURCE,
    zIndex: 999,
    style: new ol.style.Style({
        image: new ol.style.Icon({
            anchor: [0.5, 1],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            scale: 0.88,
            src: `data:image/svg+xml;utf8,${encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="42" height="54" viewBox="0 0 42 54">
                    <defs>
                        <linearGradient id="markerFill" x1="20%" y1="8%" x2="70%" y2="92%">
                            <stop offset="0%" stop-color="#60a5fa"/>
                            <stop offset="55%" stop-color="#3b82f6"/>
                            <stop offset="100%" stop-color="#1d4ed8"/>
                        </linearGradient>
                        <filter id="markerShadow" x="-70%" y="-70%" width="240%" height="240%">
                            <feDropShadow dx="0" dy="5" stdDeviation="4.2" flood-color="rgba(15,23,42,0.24)"/>
                        </filter>
                    </defs>
                    <g filter="url(#markerShadow)">
                        <path d="M21 4C13.338 4 7 10.166 7 17.95c0 4.517 2.094 8.6 5.404 12.233C15.435 33.51 18.721 36.404 21 47c2.279-10.596 5.565-13.49 8.596-16.817C32.906 26.55 35 22.467 35 17.95 35 10.166 28.662 4 21 4z" fill="url(#markerFill)"/>
                        <path d="M21 7.2c5.78 0 10.45 4.604 10.45 10.326 0 3.455-1.551 6.652-4.46 9.852-2.176 2.394-4.64 4.51-6.99 10.08-2.351-5.57-4.815-7.686-6.991-10.08-2.909-3.2-4.459-6.397-4.459-9.852C10.55 11.804 15.22 7.2 21 7.2z" fill="rgba(255,255,255,0.16)"/>
                        <circle cx="21" cy="18" r="7.6" fill="#ffffff"/>
                        <circle cx="21" cy="18" r="3.3" fill="#1d4ed8"/>
                    </g>
                </svg>
            `)}`
        })
    })
});

let activeSearchController = null;
let lastSearchResult = null;

function ensureSearchLayer(map) {
    const layers = map.getLayers().getArray();
    if (!layers.includes(SEARCH_MARKER_LAYER)) {
        map.addLayer(SEARCH_MARKER_LAYER);
    }
}

function clearSearchMarker({ resetState = true } = {}) {
    SEARCH_MARKER_SOURCE.clear();
    if (resetState) {
        lastSearchResult = null;
        setCurrentSearchResult(null);
    }
}

function setSearchMarker([longitude, latitude], label) {
    clearSearchMarker({ resetState: false });

    const feature = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([longitude, latitude])),
        name: label
    });
    SEARCH_MARKER_SOURCE.addFeature(feature);
}

function normalizeSearchResult(result) {
    if (!result) {
        return null;
    }

    const lon = Number(result.lon);
    const lat = Number(result.lat);
    const boundingbox = Array.isArray(result.boundingbox)
        ? result.boundingbox.map((value) => Number(value))
        : null;

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return null;
    }

    return {
        lon,
        lat,
        displayName: result.displayName || '',
        query: result.query || '',
        boundingbox: boundingbox?.every(Number.isFinite) ? boundingbox : null
    };
}

function buildProjectedExtent(boundingbox) {
    if (!Array.isArray(boundingbox) || boundingbox.length !== 4) {
        return null;
    }

    const [south, north, west, east] = boundingbox;
    if (![south, north, west, east].every(Number.isFinite)) {
        return null;
    }

    const southWest = ol.proj.fromLonLat([west, south]);
    const northEast = ol.proj.fromLonLat([east, north]);

    return [
        Math.min(southWest[0], northEast[0]),
        Math.min(southWest[1], northEast[1]),
        Math.max(southWest[0], northEast[0]),
        Math.max(southWest[1], northEast[1])
    ];
}

function zoomToSearchResult(result) {
    const map = getMap();
    const view = map?.getView();
    if (!map || !view) {
        return;
    }

    const extent = buildProjectedExtent(result.boundingbox);
    if (extent) {
        view.fit(extent, {
            duration: 700,
            padding: DEFAULT_VIEW_PADDING,
            maxZoom: 15
        });
        return;
    }

    view.animate({
        center: ol.proj.fromLonLat([result.lon, result.lat]),
        zoom: Math.max(view.getZoom() ?? 6, 14),
        duration: 700
    });
}

function setSearchingState(form, searching) {
    form.classList.toggle('is-loading', searching);

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = searching;
    }
}

function syncClearButtonVisibility(input, clearButton) {
    clearButton.hidden = !input.value.trim();
}

function clearSearchInput(input, clearButton) {
    input.value = '';
    clearSearchMarker();
    syncClearButtonVisibility(input, clearButton);
    input.focus();
}

async function handleLocationSearch(event) {
    event.preventDefault();

    const map = getMap();
    const form = event.currentTarget;
    const input = form.querySelector('#locationSearchInput');
    if (!map || !input) {
        return;
    }

    const query = input.value.trim();
    if (!query) {
        clearSearchMarker();
        input.focus();
        return;
    }

    activeSearchController?.abort();
    const controller = new AbortController();
    activeSearchController = controller;
    setSearchingState(form, true);

    try {
        const results = await searchLocations(query, { signal: controller.signal });
        const [bestResult] = results;

        if (!bestResult) {
            clearSearchMarker();
            showToast('No Results', `No location found for "${query}"`, 'warning', 2200);
            return;
        }

        const normalizedResult = normalizeSearchResult({
            ...bestResult,
            query
        });
        lastSearchResult = normalizedResult;
        setCurrentSearchResult(normalizedResult);
        setSearchMarker([bestResult.lon, bestResult.lat], bestResult.displayName);
        zoomToSearchResult(bestResult);
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }

        clearSearchMarker();
        showToast('Search Error', 'Unable to reach the location search service', 'error', 2600);
    } finally {
        if (activeSearchController === controller) {
            activeSearchController = null;
            setSearchingState(form, false);
        }
    }
}

export function getSearchState() {
    return lastSearchResult;
}

export function restoreSearchState(searchState, options = {}) {
    const normalizedResult = normalizeSearchResult(searchState);
    if (!normalizedResult) {
        clearSearchMarker();
        return false;
    }

    const input = document.getElementById('locationSearchInput');
    const clearButton = document.getElementById('locationSearchClear');

    lastSearchResult = normalizedResult;
    setCurrentSearchResult(normalizedResult);
    setSearchMarker([normalizedResult.lon, normalizedResult.lat], normalizedResult.displayName);

    if (input) {
        input.value = normalizedResult.query || normalizedResult.displayName || '';
    }

    if (clearButton && input) {
        syncClearButtonVisibility(input, clearButton);
    }

    if (options.zoom !== false) {
        zoomToSearchResult(normalizedResult);
    }

    return true;
}

export function initializeLocationSearch() {
    const map = getMap();
    const form = document.getElementById('locationSearchForm');
    const clearButton = document.getElementById('locationSearchClear');
    const input = document.getElementById('locationSearchInput');

    if (!map || !form || !clearButton || !input) {
        return;
    }

    ensureSearchLayer(map);
    form.addEventListener('submit', handleLocationSearch);
    syncClearButtonVisibility(input, clearButton);

    input.addEventListener('input', () => {
        syncClearButtonVisibility(input, clearButton);
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && input.value) {
            event.preventDefault();
            clearSearchInput(input, clearButton);
        }
    });

    clearButton.addEventListener('click', () => {
        clearSearchInput(input, clearButton);
    });
}
