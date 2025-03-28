import { xmlParse } from '@nzyme/xml-utils';

import { assertResponse } from './assertResponse.js';

/**
 * Parse an XML response.
 */
export async function xmlResponse(response: Response) {
    await assertResponse(response);

    const xml = await response.text();
    return xmlParse(xml);
}
