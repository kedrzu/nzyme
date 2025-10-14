import { xmlParse } from '@nzyme/xml-utils';

import { assertResponse } from './assertResponse.js';

/**
 * Parses a Response object as XML and validates the response status.
 * Uses @nzyme/xml-utils for XML parsing.
 *
 * @param response - The fetch Response object to parse
 * @returns A promise that resolves to the parsed XML document
 * @throws If the response status is not ok or if XML parsing fails
 */
export async function xmlResponse(response: Response) {
    await assertResponse(response);

    const xml = await response.text();
    return xmlParse(xml);
}
