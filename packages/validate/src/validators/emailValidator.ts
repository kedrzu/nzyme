import { defineValidator, type ValidatorOptions } from './defineValidator.js';
import type { Validator } from '../Validator.js';

const EMAIL_REGEX =
    // eslint-disable-next-line no-useless-escape
    /^(([^<>()[\]\.,;:\s@"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(".+"))@(([^<>()[\]\.,;:\s@"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

const EMAIL_MESSAGE = () => 'Adres e-mail jest nieprawidłowy';

export function emailValidator(
    options?: ValidatorOptions<string>,
): Validator<string | null | undefined> {
    return defineValidator({
        validator: isEmailValid,
        message: options?.message ?? EMAIL_MESSAGE,
    });
}

export function isEmailValid(value: string): boolean {
    return EMAIL_REGEX.test(value);
}
