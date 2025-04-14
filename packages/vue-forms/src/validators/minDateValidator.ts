import { defineValidator } from './defineValidator.js';

export function minDateValidator(params: { min: Date; message: () => string }) {
    return defineValidator({
        $validator: (value: Date | null | undefined) => {
            if (value == null) {
                return true;
            }

            return value >= params.min;
        },
        $message: params.message,
    });
}
