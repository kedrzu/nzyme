import { email } from '@vuelidate/validators';

import { defineValidator } from './defineValidator.js';

export function emailValidator(params?: { message?: () => string }) {
    return defineValidator({
        $validator: email.$validator,
        // TODO translation
        $message: params?.message || 'Podany adres e-mail jest nieprawidłowy',
    });
}
