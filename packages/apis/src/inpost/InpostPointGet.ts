import { defineEndpoint } from '@nzyme/fetch-utils';

import { INPOST_API_URL } from './constants.js';
import type { InpostPointData } from './models/InpostPointData.js';

/**
 * Get a single Inpost point by name.
 */
export const InpostPointGet = defineEndpoint({
    request: (params: { pointName: string }) => ({
        url: `${INPOST_API_URL}/v1/points/${params.pointName.toLowerCase()}`,
    }),
    response: async response => {
        if (response.status === 404) {
            return null;
        }

        const json = (await response.json()) as InpostPointData;
        if (json.status.toString() === '404') {
            return null;
        }

        return json;
    },
});
