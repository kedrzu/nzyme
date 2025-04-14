import type { Validator } from '../Validator.js';
import { defineValidator, type ValidatorOptions } from './defineValidator.js';

const EMAIL_REGEX =
    // eslint-disable-next-line no-useless-escape
    /^(([^<>()[\]\.,;:\s@"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(".+"))@(([^<>()[\]\.,;:\s@"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

const EMAIL_MESSAGE = () => 'Invalid email address';

/**
 *
 */
export function email(options?: ValidatorOptions<string>): Validator<null | string | undefined> {
    return defineValidator({
        validator: isEmailValid,
        message: options?.message ?? EMAIL_MESSAGE,
    });
}

/**
 *
 */
export function isEmailValid(value: string): boolean {
    return EMAIL_REGEX.test(value);
}
