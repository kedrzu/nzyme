import { XMLBuilder } from 'fast-xml-parser';

import type { XmlElement } from './xmlTypes.js';

const builder = new XMLBuilder({
    format: true,
    indentBy: '  ',
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    suppressEmptyNode: true,
});

/**
 * Converts a JavaScript object to an XML string.
 *
 * @util
 * @param xml - The object to convert to XML
 * @returns The XML string representation
 * @__NO_SIDE_EFFECTS__
 */
export function xmlStringify(xml: XmlElement) {
    const xmlString = builder.build(xml);
    return '<?xml version="1.0" encoding="utf-8" ?>\n' + xmlString;
}
