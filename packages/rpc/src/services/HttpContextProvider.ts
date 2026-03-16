import type { HttpResponseHeaders } from '@nzyme/fetch-utils/HttpHeaders.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { ContextProvider } from '@nzyme/ioc/services/ContextProvider.js';

import type { HttpRequest } from '../types/HttpRequest.js';

/**
 * Represents the full HTTP context for a single request lifecycle.
 */
export interface HttpContext {
    /** The incoming HTTP request */
    request: HttpRequest;
    /** Mutable response context for setting headers before the response is sent */
    response: HttpResponseContext;
}

/**
 * Mutable response context that allows setting headers during request processing.
 */
export interface HttpResponseContext {
    /** Response headers to include in the outgoing HTTP response */
    headers: HttpResponseHeaders;
}

/**
 * Service that manages HTTP context per request using a context provider.
 */
export const HttpContextProvider = defineService({
    deps: {
        ctxProvider: ContextProvider,
    },
    name: 'HttpContextProvider',
    setup({ ctxProvider }) {
        const ctxSymbol = Symbol('HttpContext');

        return {
            clear,
            get,
            getRequest,
            setRequest,
        };

        function get(): HttpContext | undefined {
            return ctxProvider.get<HttpContext>(ctxSymbol);
        }

        function getRequest(): HttpRequest | undefined {
            return get()?.request;
        }

        function setRequest(value: HttpRequest) {
            return ctxProvider.set<HttpContext>(ctxSymbol, {
                request: value,
                response: {
                    headers: {},
                },
            });
        }

        function clear() {
            ctxProvider.remove(ctxSymbol);
        }
    },
});
