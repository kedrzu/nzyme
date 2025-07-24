import { createRule } from '@regle/core';

/**
 * Requires non-empty data, only if provided data property, ref, or a function resolves to true.
 *
 * @param condition - the condition to enable the required rule
 */
export const requiredCustom = createRule({
    type: 'requiredCustom',
    validator(_value: unknown, condition: boolean) {
        console.warn('condition', condition);
        return condition;
    },
    // TODO translation
    message: () => 'Pole jest wymagane',
});
