import type { Validator } from '../Validator.js';

/**
 *
 */
export type RegexValidatorOptions = {
    /**
     *
     */
    message: (params: {
        /**
         *
         */
        value: string;
    }) => string;
    /**
     *
     */
    regex: RegExp;
};

/**
 *
 */
export function regex(options: RegexValidatorOptions): Validator<null | string | undefined> {
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
