import type { Simplify } from '@nzyme/types/Common.js';
import { computed } from 'vue';

import type { FormField, FormModel, FormValidator } from './types.js';
import { useFormField } from './useFormField.js';

/**
 * Parameters for creating multiple form fields from a form model.
 *
 * Each key can be one of:
 * - `null` or empty array `[]`: creates a field without validators
 * - `FormValidator[]`: creates a field with the specified validators
 * - Factory function `(form: FormModel<T[K]>) => V`: creates a custom field structure
 *
 * Factory functions receive a FormModel for that key's value and can return any structure.
 * This is useful for creating nested forms or adding custom properties to fields.
 *
 * @template T - Type of the form value (object with properties)
 *
 * @example
 * ```typescript
 * interface UserForm {
 *     name: string;
 *     email: string;
 *     address: { street: string; city: string };
 * }
 *
 * const form = useForm<UserForm>({ name: '', email: '', address: { street: '', city: '' } });
 *
 * const fields = useFormFields(form, {
 *     // Array of validators
 *     name: [requiredValidator()],
 *
 *     // Factory function returning custom field
 *     email: (field) => useFormField(field, {
 *         validators: [emailValidator()]
 *     }),
 *
 *     // Factory function for nested structure
 *     address: (field) => useFormFields(field, {
 *         street: [requiredValidator()],
 *         city: null
 *     })
 * });
 * ```
 */
export type FormFieldsParams<T> = {
    [K in keyof T]?: ((form: FormModel<T[K]>) => unknown) | FormValidator<T[K]>[] | null;
};

/**
 * The result type of useFormFields. Maps each key to either:
 * - A FormField if validators or null was provided
 * - The return type of the factory function if a function was provided
 *
 * @template T - Type of the form value
 * @template V - Type of the params object
 */
export type FormFields<T, V extends FormFieldsParams<T>> = Simplify<{
    [K in keyof T & keyof V & string]: V[K] extends (form: FormModel<T[K]>) => infer X ? X : FormField<T[K]>;
}>;

/**
 * Creates multiple form fields from a form model based on the provided params.
 *
 * Each key in params creates a field for the corresponding property in the form value.
 * Fields are automatically registered with the parent form and synced via computed refs.
 *
 * @template T - Type of the form value
 * @template V - Type of the params object
 * @param form - Parent form model
 * @param params - Object mapping keys to validators, null, or factory functions
 * @returns Object with a field for each key in params
 *
 * @example
 * ```typescript
 * const form = useForm({ name: '', age: 0 });
 *
 * const fields = useFormFields(form, {
 *     name: [requiredValidator()],
 *     age: [minValueValidator({ value: 18 })]
 * });
 *
 * // Use fields in your template
 * fields.name.valid // false (empty string)
 * fields.age.valid // false (0 < 18)
 * ```
 */
export function useFormFields<T, V extends FormFieldsParams<T>>(form: FormModel<T>, params: V): FormFields<T, V> {
    const fields = {} as FormFields<T, V>;

    for (const key of Object.keys(params) as (keyof T & keyof V & string)[]) {
        const value = computed({
            get: () => form.value?.[key],
            set: (newValue: T[keyof T]) => {
                if (form.value == null) {
                    return;
                }

                form.value[key] = newValue as (typeof form.value)[typeof key];
            },
        });

        const validatorsOrGetter = params[key];
        if (typeof validatorsOrGetter === 'function') {
            const field = useFormField(form, { value });
            const result = validatorsOrGetter(field as FormModel<T[keyof T & string]>);

            fields[key] = result as (typeof fields)[typeof key];
        } else {
            const field = useFormField(form, {
                value,
                validators: validatorsOrGetter || [],
            });

            fields[key] = field as (typeof fields)[typeof key];
        }
    }

    return fields;
}
