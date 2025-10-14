import { createRule } from '@regle/core';

import { translateToString } from '@nzyme/i18n';
import type { Language } from '@nzyme/i18n';

import * as l from './validators.loc.js';

/**
 * Requires non-empty data, only if provided data property, ref, or a function resolves to true.
 *
 * @param condition - the condition to enable the required rule
 */
export const requiredCustom = createRule({
    type: 'requiredCustom',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validator(value: unknown, condition: boolean, lang: Language) {
        return condition;
    },
    message: ({ $params: [_condition, lang] }) => translateToString(l.required, lang),
});
