import useVuelidate, {
    type ValidationArgs as ValidationArgsImport,
    type Validation as ValidationImport,
} from '@vuelidate/core';
import { isRef, reactive, type Ref } from 'vue';

import type { ValidationArgs } from './validation.js';

export function useForm<T>(state: Ref<T> | T, validation: ValidationArgs<T>) {
    // Fill out any missing fields with empty validation.
    const stateValue = isRef(state) ? state.value : state;
    for (const key in stateValue) {
        if (!validation[key as unknown as keyof ValidationArgs<T>]) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            validation[key as unknown as keyof ValidationArgs<T>] = {} as any;
        }
    }

    const fields = useVuelidate(validation as ValidationArgsImport<T>, state);

    return reactive({
        fields: fields as unknown as ValidationImport<ValidationArgsImport<T>, T>,
        validate() {
            return fields.value.$validate();
        },
        resetValidation() {
            fields.value.$reset();
        },
    });
}
