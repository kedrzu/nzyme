import { watch } from 'vue';

import type { FormValidatorBehavior } from '../types.js';

/**
 * Validator behavior that validates the field on blur.
 */
export const showErrorsOnBlurBehavior: FormValidatorBehavior = ({ value, focused, show }) => {
    // Default validator behavior
    let valueChanged = false;

    watch(value, () => {
        valueChanged = true;
        if (focused.value) {
            show.value = false;
        }
    });

    watch(focused, focusedValue => {
        if (!focusedValue && valueChanged) {
            show.value = true;
            valueChanged = false;
        }
    });

    watch(show, () => {
        valueChanged = false;
    });
};
