import type { QueryObject } from 'ufo';
import { withQuery } from 'ufo';

import { assertResponse } from './assertResponse.js';
import type { HttpMethod } from './types/HttpMethod.js';

export interface FetchRequest extends RequestInit {
    url: string;
    query?: QueryObject;
    method?: HttpMethod;
    headers?: Record<string, string>;
}

export async function fetchRequest(request: FetchRequest): Promise<Response> {
    const url = request.query ? withQuery(request.url, request.query) : request.url;
    const response = await fetch(url, request);

    await assertResponse(response);
    // Clone the response to avoid "Other side closed error"
    return response.clone();
}
