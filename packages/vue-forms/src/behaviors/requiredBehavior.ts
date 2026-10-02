import { watch } from 'vue';

import type { FormValidatorBehavior } from '../types.js';

/**
 * Behavior for `requiredValidator`: reveals the error as soon as the value changes while the
 * field is focused. Unless `lazy`, it also reveals on blur; when `lazy`, blur alone never reveals
 * it — the error only shows once `validate()` runs (typically on submit).
 */
export function requiredBehavior(lazy: boolean): FormValidatorBehavior {
    return ({ value, focused, show }) => {
        watch(value, () => {
            if (focused.value) {
                show.value = true;
            }
        });

        if (!lazy) {
            watch(focused, focusedValue => {
                if (!focusedValue) {
                    show.value = true;
                }
            });
        }
    };
}
