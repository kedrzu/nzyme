/** A value longer than this, as JSON, is cut: the file holds it whole. */
const MAX_VALUE_LENGTH = 400;

/**
 * A JSON value as inline Markdown code for a report, cut when long; `(absent)` for `undefined`.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function formatPenValue(value: unknown): string {
    if (value === undefined) {
        return '(absent)';
    }

    const json = JSON.stringify(value);
    const shown = json.length > MAX_VALUE_LENGTH ? `${json.slice(0, MAX_VALUE_LENGTH)}…` : json;
    const fence = shown.includes('`') ? '``' : '`';
    const suffix = shown === json ? '' : ` (${json.length} characters, cut)`;

    return `${fence}${shown}${fence}${suffix}`;
}
