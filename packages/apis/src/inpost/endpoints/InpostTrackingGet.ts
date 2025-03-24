import { defineEndpoint, jsonResponse } from '@nzyme/fetch-utils';

import type { InpostTrackingData } from '../models/InpostTrackingData.js';

/**
 * Get Inpost tracking data by tracking number.
 */
export const InpostTrackingGet = defineEndpoint({
    request: (params: { trackingNumber: string }) => ({
        url: `v1/tracking/${params.trackingNumber}`,
    }),
    response: jsonResponse<InpostTrackingData>,
});
