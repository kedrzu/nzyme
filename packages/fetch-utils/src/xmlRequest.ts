import { xmlStringify } from '@nzyme/xml-utils/xmlStringify.js';
import type { XmlElement } from '@nzyme/xml-utils/xmlTypes.js';

import type { FetchRequest } from './fetchRequest.js';

/**
 * Request configuration for XML requests.
 * Extends the base FetchRequest but requires an XML element as the body.
 */
export interface EndpointXmlRequest extends Omit<FetchRequest, 'body'> {
    /** The XML element to be sent as the request body */
    body?: XmlElement;
}

/**
 * Creates a fetch request with XML body.
 * Automatically sets the appropriate Content-Type header and serializes the XML element to a string.
 * @util
 * @param request - The request configuration with XML data
 * @returns A FetchRequest configured for XML submission
 */
export function xmlRequest(request: EndpointXmlRequest): FetchRequest {
    if (!request.body) {
        return request as FetchRequest;
    }

    return {
        ...request,
        headers: {
            ...request.headers,
            'Content-Type': 'text/xml',
        },
        body: xmlStringify(request.body),
    };
}
