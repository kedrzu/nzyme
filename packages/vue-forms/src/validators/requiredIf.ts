import { createRule } from '@regle/core';
import { isFilled } from '@regle/rules';

import { translateToString } from '@nzyme/i18n';
import type { Language } from '@nzyme/i18n';

import * as l from './validators.loc.js';

/**
 * Requires non-empty data, only if provided data property, ref, or a function resolves to true.
 *
 * @param condition - the condition to enable the required rule
 */
export const requiredIf = createRule({
    type: 'requiredIf',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validator(value: unknown, condition: boolean, lang: Language) {
        if (condition) {
            return isFilled(value, true) as false;
        }

        return true;
    },
    message: ({ $params: [_condition, lang] }) => translateToString(l.required, lang),
    active({ $params: [condition] }) {
        return condition;
    },
});
