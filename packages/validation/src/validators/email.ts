import type { Validator } from '../Validator.js';
import { defineValidator } from './defineValidator.js';
import type { ValidatorOptions } from './defineValidator.js';

const EMAIL_REGEX =
    // eslint-disable-next-line no-useless-escape
    /^(([^<>()[\]\.,;:\s@"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(".+"))@(([^<>()[\]\.,;:\s@"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

const EMAIL_MESSAGE = () => 'Invalid email address';

/**
 * Creates a validator that checks if a string is a valid email address.
 * @util
 */
export function email(options?: ValidatorOptions<string>): Validator<string | null | undefined> {
    return defineValidator({
        validator: isEmailValid,
        message: options?.message ?? EMAIL_MESSAGE,
    });
}

/**
 * Checks whether a string matches a valid email address format.
 * @util
 */
export function isEmailValid(value: string): boolean {
    return EMAIL_REGEX.test(value);
}
