import { createRule } from '@regle/core';
import { isFilled } from '@regle/rules';

/**
 * Requires non-empty data, only if provided data property, ref, or a function resolves to true.
 *
 * @param condition - the condition to enable the required rule
 */
export const requiredIf = createRule({
    type: 'requiredIf',
    validator(value: unknown, condition: boolean) {
        if (condition) {
            return isFilled(value);
        }

        return true;
    },
    // TODO translation
    message: 'Pole jest wymagane',
    active({ $params: [condition] }) {
        return condition;
    },
});
