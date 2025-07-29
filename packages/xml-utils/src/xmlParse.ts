import { XMLParser } from 'fast-xml-parser';

import type { XmlElement } from './xmlTypes.js';

const parser = new XMLParser();

/**
 *
 */
export function xmlParse<T = XmlElement>(xml: string) {
    return parser.parse(xml) as T;
}
