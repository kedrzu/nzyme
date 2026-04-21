import type { Validator } from '../Validator.js';

/**
 * Options for creating a regex-based validator.
 */
export type RegexValidatorOptions = {
    /** Function that generates the error message when the regex test fails */
    message: (params: {
        /** The value that failed validation */
        value: string;
    }) => string;
    /** Regular expression pattern to test against */
    regex: RegExp;
};

/**
 * Creates a validator that tests a string against a regular expression.
 */
export function regex(options: RegexValidatorOptions): Validator<string | null | undefined> {
    const { regex, message } = options;

    return (value, ctx) => {
        if (value == null) {
            return;
        }

        if (regex.test(value)) {
            return;
        }

        return message({ ...ctx, value });
    };
}
