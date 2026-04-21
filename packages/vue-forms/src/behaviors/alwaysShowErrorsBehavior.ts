import type { FormValidatorBehavior } from '../types.js';

/**
 * Validator behavior that always shows the validation errors.
 */
export const alwaysShowErrorsBehavior: FormValidatorBehavior = ({ show }) => {
    show.value = true;
};
