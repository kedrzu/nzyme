/** A primitive XML attribute value. */
export type XmlAttribute = boolean | number | string;
/** A node in a parsed XML tree - can be a primitive, array, or nested object. */
export type XmlNode = XmlAttribute | XmlNode[] | { [key: string]: XmlNode | undefined };
/** A parsed XML element represented as a key-value map of child nodes. */
export type XmlElement = { [key: string]: XmlNode };
