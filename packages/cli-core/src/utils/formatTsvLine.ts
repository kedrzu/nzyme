/**
 * One tab-separated output line, newline included. Tabs and line breaks inside a field become spaces,
 * so a subject can never split a line or shift the columns.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function formatTsvLine(fields: (string | number)[]): string {
    return fields.map(field => String(field).replace(/[\t\r\n]+/g, ' ')).join('\t') + '\n';
}
