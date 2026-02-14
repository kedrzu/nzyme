import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';
import { jsonNullableResponse } from '@nzyme/fetch-utils/jsonNullableResponse.js';

import type { DhlPickUpPoint } from './DhlPickUpPoint.js';

/**
 * Parameters for listing DHL pickup points.
 */
export interface DhlPickupPointListParams {
    /**
     * The country to list pickup points for.
     */
    country: string;
    /**
     * The city to filter pickup points by.
     */
    city?: string;
    /**
     * The street to filter pickup points by.
     */
    street?: string;
    /**
     * The postal code to filter pickup points by.
     */
    postalCode?: string;
    /**
     * The maximum number of pickup points to return.
     */
    limit?: number;
    /**
     * Fuzzy search for the city, street or postal code.
     */
    fuzzy?: string;
}

/**
 * List DHL pickup points.
 */
export const DhlPickupPointList = defineEndpoint({
    request: (params: DhlPickupPointListParams) => ({
        url: `https://api-gw.dhlparcel.nl/parcel-shop-locations/${params.country}`,
        query: {
            city: params.city,
            street: params.street,
            postalCode: params.postalCode,
            limit: params.limit,
            fuzzy: params.fuzzy,
        },
    }),
    response: jsonNullableResponse<DhlPickUpPoint[]>,
});
