import type { IncomingMessage, RequestListener, ServerResponse } from 'http';

import type { HttpMethod } from '@nzyme/fetch-utils';

import type { ApiRouter } from './ApiRouter.js';

/**
 * Creates a new HTTP handler for the API router.
 */
export function createListener(api: ApiRouter): RequestListener {
    return (req, res) => void handleRequest(req, res);

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
