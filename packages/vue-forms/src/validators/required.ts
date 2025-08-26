import { createRule } from '@regle/core';
import { isFilled } from '@regle/rules';

import { translateToString } from '@nzyme/i18n';
import type { Language } from '@nzyme/i18n';

import * as l from './validators.loc.js';

export const required = createRule({
    type: 'required',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validator(value: unknown, lang: Language) {
        return isFilled(value, true) as false;
    },
    message: ({ $params: [lang] }) => translateToString(l.required, lang),
});
