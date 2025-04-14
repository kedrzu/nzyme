import { defineValidator } from './defineValidator.js';

export function regexValidator(params: { regex: RegExp; message?: string | (() => string) }) {
    const regex = params.regex;
    return defineValidator({
        $validator: (value: unknown) => {
            if (!value) {
                return true;
            }

            if (typeof value === 'string') {
                return regex.test(value);
            }

            return false;
        },
        $message: params.message || `Nieprawiłowy format.`,
    });
}
