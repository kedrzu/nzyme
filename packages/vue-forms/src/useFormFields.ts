import { computed } from 'vue';

import type { Simplify } from '@nzyme/types';

import type { FormField, FormModel, FormValidator } from './types.js';
import { useFormField } from './useFormField.js';

/**
 *
 */
export type FormFieldsParams<T, K extends keyof T> = {
    [KK in K]: FormValidator<T[KK]>[] | null;
};

/**
 *
 */
export type FormFields<T, K extends keyof T> = Simplify<{
    /**
     *
     */
    [KK in K]: FormField<T[KK]>;
}>;

/**
 *
 */
export function useFormFields<T, K extends keyof T>(
    form: FormModel<T>,
    params: FormFieldsParams<T, K>,
): FormFields<T, K> {
    const fields = {} as FormFields<T, K>;

    for (const key of Object.keys(params) as K[]) {
        const value = computed({
            get: () => form.value[key],
            set: value => {
                form.value[key] = value;
            },
        });

        const field = useFormField(form, {
            value,
            validators: params[key] || [],
        });

        fields[key] = field;
    }

    return fields;
}
