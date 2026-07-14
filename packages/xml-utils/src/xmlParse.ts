import { XMLParser } from 'fast-xml-parser';

import type { XmlElement } from './xmlTypes.js';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
    isArray: () => false, // Let the consumer handle arrays
});

/**
 * Parses an XML string into a JavaScript object.
 *
 * @util
 * @param xml - The XML string to parse
 * @returns The parsed XML as a JavaScript object
 * @__NO_SIDE_EFFECTS__
 */
export function xmlParse<T = XmlElement>(xml: string) {
    return parser.parse(xml) as T;
}
