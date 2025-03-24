import { defineFetchClient, fetchEndpoint } from '@nzyme/fetch-utils';
import { defineService } from '@nzyme/ioc';

/**
 * Inpost client service.
 */
export const InpostClient = defineService({
    name: 'InpostClient',
    setup() {
        const baseUrl = 'https://api-shipx-pl.easypack24.net';

        return defineFetchClient((endpoint, params) => {
            return fetchEndpoint(endpoint, {
                baseUrl,
                params: params,
            });
        });
    },
});
