import { helpers } from '@vuelidate/validators';

import type { ValidationArgs } from '../validation.js';

export function arrayValidator<T>(validation: ValidationArgs<T>) {
    return {
        $each: helpers.forEach(validation),
    };
}
