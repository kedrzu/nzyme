import { minLength } from '@vuelidate/validators';

import { defineValidator } from './defineValidator.js';

export function minLengthValidator(params: { min: number; message?: () => string }) {
    return defineValidator({
        $validator: minLength(params.min).$validator,
        $message: params.message || `Minimalna długość to ${params.min} znaków`,
    });
}
