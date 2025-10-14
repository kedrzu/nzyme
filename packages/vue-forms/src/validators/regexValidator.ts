import { createRule } from '@regle/core';

import { translateToString } from '@nzyme/i18n';
import type { Language } from '@nzyme/i18n';

import * as l from './validators.loc.js';

/**
 * Regex validator that checks if the value matches a given regular expression
 * @returns Regle validation rule
 */
export const regexValidator = createRule({
    type: 'regex',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validator: (value: unknown, regex: RegExp, lang: Language) => validateRegex(value, regex),
    message: ({ $params: [_regex, lang] }) => translateToString(l.invalidFormat, lang),
});

/**
 * Validates if the value matches the regex pattern
 * @param value - The value to validate
 * @param regex - The regex pattern to match against
 * @returns True if valid or empty, false otherwise
 * @__NO_SIDE_EFFECTS__
 */
function validateRegex(value: unknown, regex: RegExp) {
    if (!value) {
        return true;
    }

    if (typeof value === 'string') {
        return regex.test(value);
    }

    return false;
}
