import { defineValidator } from './defineValidator.js';

function validateRequired(value: unknown) {
    if (value == null || value === false) {
        return false;
    }
    if (typeof value === 'string') {
        return value.trim() !== '';
    }

    return true;
}

export function requiredValidator(params?: { message?: () => string }) {
    return defineValidator({
        $validator: validateRequired,
        // TODO translation
        $message: params?.message || 'Pole jest wymagane',
    });
}

export function requiredIfValidator<TModel = unknown>(params: {
    condition: (model: TModel) => boolean;
    message?: () => string;
}) {
    return defineValidator({
        $validator: (value: unknown, model: unknown) => {
            if (params.condition(model as TModel)) {
                return validateRequired(value);
            }

            return true;
        },
        // TODO translation
        $message: params?.message || 'Pole jest wymagane',
    });
}
