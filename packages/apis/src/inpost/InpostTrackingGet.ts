import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';
import { jsonNullableResponse } from '@nzyme/fetch-utils/jsonNullableResponse.js';

import { INPOST_API_URL } from './constants.js';
import type { InpostTrackingData } from './models/InpostTrackingData.js';

/**
 * Get Inpost tracking data by tracking number.
 */
export const InpostTrackingGet = defineEndpoint({
    request: (params: { trackingNumber: string }) => ({
        url: `${INPOST_API_URL}/v1/tracking/${params.trackingNumber}`,
    }),
    response: jsonNullableResponse<InpostTrackingData>,
});
