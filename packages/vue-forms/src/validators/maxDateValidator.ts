import { defineValidator } from './defineValidator.js';

export function maxDateValidator(params: { max: Date; message: () => string }) {
    return defineValidator({
        $validator: (value: Date | null | undefined) => {
            if (value == null) {
                return true;
            }

            return value <= params.max;
        },
        $message: params.message,
    });
}
