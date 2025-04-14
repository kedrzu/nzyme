import { minValue } from '@vuelidate/validators';

import { defineValidator } from './defineValidator.js';

export function minValueValidator(params: { min: number; message?: () => string }) {
    return defineValidator({
        $validator: minValue(params.min).$validator,
        $message: params.message || `Minimalna wartość to ${params.min}`,
    });
}
