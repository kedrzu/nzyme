import { createRule } from '@regle/core';
import { isFilled } from '@regle/rules';

export const required = createRule({
    type: 'required',
    validator: isFilled,
    // TODO translation
    message: 'Pole jest wymagane',
});
