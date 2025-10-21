import type { IncomingMessage, RequestListener, ServerResponse } from 'http';

import type { NextFunction } from 'connect';
import { parsePath, parseQuery } from 'ufo';

import type { HttpMethod } from '@nzyme/fetch-utils';

import type { Router } from './createRouter.js';

/**
 * Options for the {@link createMiddleware} function.
 */
export interface CreateMiddlewareOptions {
    /**
     * The API router that will handle the requests.
     */
    router: Router;

    /**
     * A function that will be called before a request is handled by the router.
     * Can be used to log requests, etc.
     */
    beforeRequest?: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

    /**
     * A function that will be called after a request is handled by the router.
     * Can be used to log requests, etc.
     */
    afterRequest?: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;
}

/**
 * Creates a new HTTP request listener for the API router.
 *
 * This function bridges the Node.js HTTP server with the API router by converting
 * Node.js's request/response objects into the format expected by the router.
 *
 * @param router - The API router that will handle the requests
 * @returns A request listener compatible with Node.js HTTP server
 */
export function createMiddleware(options: CreateMiddlewareOptions): RequestListener {
    const { router, beforeRequest, afterRequest } = options;

    return (req, res) => void handleRequest(req, res);

    /**
     * Processes an HTTP request by converting it to the format expected by the API router
     * and writing the response back to the client.
     *
     * @param req - The incoming HTTP request
     * @param res - The server response to write to
     */
    async function handleRequest(req: IncomingMessage, res: ServerResponse, next?: NextFunction) {
        await beforeRequest?.(req, res);

        const url = parsePath(req.url || '/');
        const response = await router.execute({
            method: (req.method || 'GET') as HttpMethod,
            path: url.pathname,
            query: parseQuery(url.search),
            headers: req.headers,
            body: await getBody(req),
            ip: getIp(req) || '::1',
        });

        res.writeHead(response.status, response.statusText, response.headers);
        res.end(response.body);

        await afterRequest?.(req, res);
        next?.();
    }

    function getIp(req: IncomingMessage) {
        const xForwardedFor = req.headers['x-forwarded-for'];
        if (Array.isArray(xForwardedFor)) {
            return xForwardedFor[0];
        }

        if (xForwardedFor) {
            return xForwardedFor;
        }

        return req.socket.remoteAddress;
    }
}

/**
 * Extracts the request body from an IncomingMessage as a string.
 *
 * @param request - The incoming HTTP request
 * @returns A promise resolving to the request body as a string
 */
function getBody(request: IncomingMessage) {
    return new Promise<string>(resolve => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bodyParts: any[] = [];
        let body: string;
        request
            .on('data', chunk => {
                bodyParts.push(chunk);
            })
            .on('end', () => {
                body = Buffer.concat(bodyParts).toString();
                resolve(body);
            });
    });
}
