import { asyncValidator } from './asyncValidator.js';

export function phoneNumberValidator() {
    return asyncValidator({
        validator: validatePhoneNumber,
        message: () => 'Numer telefonu jest niepoprawny.',
    });
}

async function validatePhoneNumber(value: null | string | undefined) {
    const phone = value?.toString();
    if (!phone) {
        // ignore this validation
        return true;
    }

    const { parsePhoneNumberWithError } = await import('libphonenumber-js');

    try {
        const number = parsePhoneNumberWithError(phone);
        return !!number.country && !!number.isValid();
    } catch {
        return false;
    }
}
