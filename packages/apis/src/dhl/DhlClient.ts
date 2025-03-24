import { defineFetchClient, fetchEndpoint } from '@nzyme/fetch-utils';
import { constValue, defineService, envVariable, fallback } from '@nzyme/ioc';

import { DHL_API_URL_EU } from './constants.js';

/**
 * DHL client service.
 */
export const DhlClient = defineService({
    name: 'DhlClient',
    deps: {
        apiKey: envVariable('DHL_API_KEY'),
        apiUrl: fallback(envVariable('DHL_API_URL'), constValue(DHL_API_URL_EU)),
    },
    setup({ apiKey, apiUrl }) {
        return defineFetchClient((endpoint, params) => {
            return fetchEndpoint(endpoint, {
                baseUrl: apiUrl,
                params: params,
                headers: {
                    'DHL-API-Key': apiKey ?? '',
                },
            });
        });
    },
});
