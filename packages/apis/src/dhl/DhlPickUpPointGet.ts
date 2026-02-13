import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';
import { jsonNullableResponse } from '@nzyme/fetch-utils/jsonNullableResponse.js';

import type { DhlPickUpPoint } from './DhlPickUpPoint.js';

/**
 * Parameters for getting a DHL pickup point.
 */
export interface DhlPickupPointGetParams {
    /**
     * The country to get the pickup point for.
     */
    country: string;
    /**
     * The ID of the pickup point to get.
     */
    id: string;
}

/**
 * Get a DHL pickup point.
 */
export const DhlPickupPointGet = defineEndpoint({
    request: (params: DhlPickupPointGetParams) => ({
        url: `https://api-gw.dhlparcel.nl/parcel-shop-locations/${params.country}/${params.id}`,
    }),
    response: jsonNullableResponse<DhlPickUpPoint>,
});
