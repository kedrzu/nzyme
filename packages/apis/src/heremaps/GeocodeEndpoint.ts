import { defineEndpoint, jsonResponse } from '@nzyme/fetch-utils';

// We use Here maps for geocoding
// https://developer.here.com/documentation/geocoding-search-api/dev_guide/topics/endpoint-geocode-brief.html
// https://developer.here.com/documentation/geocoding-search-api/api-reference-swagger.html

/**
 * Geocoding position
 */
export interface GeocodingPosition {
    /**
     * Latitude
     */
    lat: number;
    /**
     * Longitude
     */
    lng: number;
}

/**
 * Geocoding address
 */
export interface GeocodingAddress {
    /**
     * Label
     */
    label: string;
    /**
     * Country code
     */
    countryCode: string;
    /**
     * Country name
     */
    countryName: string;
    /**
     * States
     */
    state?: string;
    /**
     * County
     */
    county?: string;
    /**
     * City
     */
    city?: string;
    /**
     * District
     */
    district?: string;
    /**
     * Subdistrict
     */
    subdistrict?: string;
    /**
     * Postal code
     */
    postalCode?: string;
}

/**
 * Geocoding item
 */
export interface GeocodingItem {
    /**
     * Position
     */
    position: GeocodingPosition;
    /**
     * Address
     */
    address: GeocodingAddress;
    // it has much more props, but we don't need it
}

/**
 * Geocoding result
 */
export interface GeocodingResult {
    /**
     * Items
     */
    items: GeocodingItem[];
}

/**
 * Geocoding input
 */
export interface GeocodingInput {
    /**
     * API key
     */
    apiKey: string;
    /**
     * Limit
     */
    limit?: number;
    /**
     * Country
     */
    country?: string;
    /**
     * City
     */
    city?: string;
    /**
     * Postal code
     */
    postalCode?: string;
    /**
     * Street
     */
    street?: string;
}

/**
 * Geocode endpoint
 */
export const GeocodeEndpoint = defineEndpoint({
    request: (input: GeocodingInput) => ({
        url: 'https://geocode.search.hereapi.com/v1/geocode',
        query: {
            qq: getQualifiedQuery({
                country: input.country,
                city: input.city,
                postalCode: input.postalCode,
            }),
            q: input.street,
            limit: input.limit ?? '1',
            apiKey: input.apiKey,
        },
    }),
    response: jsonResponse<GeocodingResult>,
});

function getQualifiedQuery(query: Record<string, string | undefined>) {
    let qq = '';

    for (const [key, value] of Object.entries(query)) {
        if (!value) {
            continue;
        }

        if (qq) {
            qq += ';';
        }

        // ";" is a special char in qualified query, so replace it
        const encoded = value.replace(/;/g, ',');

        qq += `${key}=${encoded}`;
    }

    if (qq.length === 0) {
        return undefined;
    }

    return qq;
}
