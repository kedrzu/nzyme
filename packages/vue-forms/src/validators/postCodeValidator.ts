import { asyncValidator } from './asyncValidator.js';

async function validatePostCode(
    value: string | null | undefined,
    country: string | null | undefined,
) {
    const postcode = value?.toString();
    if (!postcode || !country) {
        // ignore this validation
        return true;
    }

    const { validate } = await import('postal-codes-js');
    const result = validate(country, postcode);

    return result === true;
}

interface PostCodeValidatorParams {
    country: string | (() => string);
}

export function postCodeValidator(params: PostCodeValidatorParams) {
    return asyncValidator({
        validator(value: string | null | undefined) {
            return validatePostCode(
                value,
                typeof params.country === 'function' ? params.country() : params.country,
            );
        },
        message: () => 'Kod pocztowy jest niepoprawny.',
    });
}
