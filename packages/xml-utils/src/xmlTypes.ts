/**
 *
 */
export type XmlAttribute = boolean | number | string;
/**
 *
 */
export type XmlNode = XmlAttribute | XmlNode[] | { [key: string]: XmlNode | undefined };
/**
 *
 */
export type XmlElement = { [key: string]: XmlNode };
