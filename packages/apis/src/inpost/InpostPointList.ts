import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';
import { jsonNullableResponse } from '@nzyme/fetch-utils/jsonNullableResponse.js';

import { INPOST_API_URL } from './constants.js';
import type { InpostPointData } from './models/InpostPointData.js';

type InpostPointFunction = 'parcel_collect' | 'parcel_send';

/**
 * Parameters for the Inpost point list endpoint.
 */
export type InpostPointListParams = {
    /**
     * Sort order.
     */
    sortOrder?: 'asc' | 'desc';
    /**
     * Sort by.
     */
    sortBy?: 'distance_to_relative_point' | 'name' | 'status';
    /**
     * Fields to include in the response.
     */
    fields?: (keyof InpostPointData)[];
    /**
     * Limit the number of points returned.
     */
    limit?: number;
    /**
     * Functions to filter by.
     */
    functions?: InpostPointFunction[];
    /**
     * Relative point to filter by.
     */
    relativePoint?: string;
    /**
     * Relative post code to filter by.
     */
    relativePostCode?: string;
};

/**
 * Get a list of Inpost points.
 */
export const InpostPointList = defineEndpoint({
    request: (params: InpostPointListParams) => ({
        url: `${INPOST_API_URL}/v1/points`,
        query: {
            sort_order: params.sortOrder,
            sort_by: params.sortBy,
            fields: params.fields?.join(','),
            limit: params.limit,
            functions: params.functions?.join(','),
            relative_point: params.relativePoint,
            relative_post_code: params.relativePostCode,
        },
    }),
    response: jsonNullableResponse<{ items: InpostPointData[] }>,
});
