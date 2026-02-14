import type { Validator } from '../Validator.js';
import { defineValidator } from './defineValidator.js';
import type { ValidatorOptions } from './defineValidator.js';

const FILENAME_REGEX = /^[^<>:;,?"*|/]+$/;
const FILENAME_MESSAGE = () => 'Invalid filename';

/**
 *
 */
export function filename(options: ValidatorOptions<string>): Validator<string | null | undefined> {
    return defineValidator({
        validator: isFilenameValid,
        message: options.message ?? FILENAME_MESSAGE,
    });
}

/**
 *
 */
export function isFilenameValid(value: string): boolean {
    return FILENAME_REGEX.test(value);
}
