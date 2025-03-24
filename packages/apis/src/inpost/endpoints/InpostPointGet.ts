import { defineEndpoint, jsonResponse } from '@nzyme/fetch-utils';

import type { InpostPointData } from '../models/InpostPointData.js';

/**
 * Get a single Inpost point by name.
 */
export const InpostPointGet = defineEndpoint({
    request: (params: { pointName: string }) => ({
        url: `v1/points/${params.pointName.toLowerCase()}`,
    }),
    response: jsonResponse<InpostPointData>,
});
