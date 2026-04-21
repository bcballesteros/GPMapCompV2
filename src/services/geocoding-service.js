const NOMINATIM_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_RESULT_LIMIT = 5;
const DEFAULT_COUNTRY_CODES = ['ph'];

export async function searchLocations(query, options = {}) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return [];
    }

    const params = new URLSearchParams({
        q: trimmedQuery,
        format: 'jsonv2',
        addressdetails: '1',
        limit: String(options.limit ?? DEFAULT_RESULT_LIMIT),
        countrycodes: (options.countrycodes ?? DEFAULT_COUNTRY_CODES).join(','),
        dedupe: '1'
    });

    const response = await fetch(`${NOMINATIM_SEARCH_ENDPOINT}?${params.toString()}`, {
        method: 'GET',
        signal: options.signal,
        headers: {
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Geocoding request failed with status ${response.status}`);
    }

    const results = await response.json();
    if (!Array.isArray(results)) {
        return [];
    }

    return results.map((result) => ({
        lat: Number(result.lat),
        lon: Number(result.lon),
        displayName: result.display_name,
        boundingbox: Array.isArray(result.boundingbox) ? result.boundingbox.map(Number) : null
    })).filter((result) => Number.isFinite(result.lat) && Number.isFinite(result.lon));
}
