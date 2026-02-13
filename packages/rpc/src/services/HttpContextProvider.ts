import type { HttpResponseHeaders } from '@nzyme/fetch-utils/HttpHeaders.js';
import { ContextProvider } from '@nzyme/ioc/services/ContextProvider.js';
import { defineService } from '@nzyme/ioc/Service.js';

import type { HttpRequest } from '../types/HttpRequest.js';

/**
 *
 */
export interface HttpContext {
    /**
     *
     */
    request: HttpRequest;
    /**
     *
     */
    response: HttpResponseContext;
}

/**
 *
 */
export interface HttpResponseContext {
    /**
     *
     */
    headers: HttpResponseHeaders;
}

/**
 *
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
