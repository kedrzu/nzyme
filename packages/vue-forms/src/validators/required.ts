import { createRule } from '@regle/core';
import { isFilled } from '@regle/rules';

export const required = createRule<unknown, [], false, false, false>({
    type: 'required',
    validator: value => isFilled(value, true) as false,
    // TODO translation
    message: () => 'Pole jest wymagane',
});
