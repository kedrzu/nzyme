import type { IncomingMessage, RequestListener, ServerResponse } from 'http';

import type { HttpMethod } from '@nzyme/fetch-utils';

import type { ApiRouter } from './ApiRouter.js';

/**
 * Creates a new HTTP request listener for the API router.
 *
 * This function bridges the Node.js HTTP server with the API router by converting
 * Node.js's request/response objects into the format expected by the router.
 *
 * @param api - The API router that will handle the requests
 * @returns A request listener compatible with Node.js HTTP server
 */
export function createListener(api: ApiRouter): RequestListener {
    return (req, res) => void handleRequest(req, res);

    /**
     * Processes an HTTP request by converting it to the format expected by the API router
     * and writing the response back to the client.
     *
     * @param req - The incoming HTTP request
     * @param res - The server response to write to
     */
    async function handleRequest(req: IncomingMessage, res: ServerResponse) {
        const response = await api.execute({
            method: (req.method || 'GET') as HttpMethod,
            path: req.url || '/',
            headers: req.headers,
            body: await getBody(req),
        });

        res.writeHead(response.status, response.statusText, response.headers);
        res.end(response.body);
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
