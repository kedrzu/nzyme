import { os } from '@orpc/server';

import type { Container } from '@nzyme/ioc';

import type { EndpointHandler } from './defineEndpoint.js';

/**
 * The context for the API.
 */
export interface ApiContext {
    /**
     * The IoC container for the API.
     */
    container: Container;

    /**
     *
     */
    cachedHandlers: Map<symbol, EndpointHandler>;
}

/**
 * The context for the API.
 */
export const api = os.$context<ApiContext>();
