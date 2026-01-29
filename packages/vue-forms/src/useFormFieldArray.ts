import { computed, effectScope, watch } from 'vue';
import type { EffectScope } from 'vue';

import { reactive } from '@nzyme/vue-utils';

import type { FormField, FormModel, FormValidator } from './types.js';
import { useFormField } from './useFormField.js';

/**
 * Factory function that creates fields for each item in an array.
 * @template T - Type of each array item
 * @template V - Return type of the factory function
 */
type FormFieldFactory<T = unknown, V = unknown> = (field: FormModel<T>, index: number) => V;

const SCOPE = Symbol('EffectScope');

interface FieldWithScope extends FormField {
    [SCOPE]: EffectScope;
}

/**
 * Creates a reactive array of form fields from a form with array value.
 * Each field corresponds to an item in the array and applies the provided validators.
 *
 * Fields are automatically created and disposed when array items are added or removed.
 * Each field runs in its own effect scope to ensure proper cleanup of watchers.
 *
 * @template T - Type of each array item
 * @param form - Parent form model with array value
 * @param validators - Optional validators to apply to each field
 * @returns Reactive array of form fields
 *
 * @example
 * ```typescript
 * const form = useForm(['', '', '']);
 * const fields = useFormFieldArray(form, [requiredValidator()]);
 *
 * // Each field validates its corresponding array item
 * fields[0].valid // false (empty string)
 *
 * // Adding items updates fields automatically
 * form.value.push('new item');
 * // fields.length is now 4
 *
 * // Removing items cleans up field scopes
 * form.value.pop();
 * // fields.length is now 3
 * ```
 */
export function useFormFieldArray<T>(form: FormModel<T[]>, validators?: FormValidator<T>[]): FormField<T>[];

/**
 * Creates a reactive array of custom field structures from a form with array value.
 * The factory function receives each item as a form model and can create complex nested structures.
 *
 * This is useful for creating nested form structures where each array item has multiple fields.
 * The factory runs in an effect scope that is automatically cleaned up when the item is removed.
 *
 * @template T - Type of each array item
 * @template V - Return type of the factory function
 * @param form - Parent form model with array value
 * @param factory - Factory function that creates field structure for each item
 * @returns Reactive array of custom field structures
 *
 * @example
 * ```typescript
 * interface Person {
 *     name: string;
 *     email: string;
 * }
 *
 * const form = useForm<Person[]>([{ name: '', email: '' }]);
 *
 * const fields = useFormFieldArray(form, (field, index) => {
 *     return useFormFields(field, {
 *         name: [requiredValidator()],
 *         email: (f) => useFormField(f, {
 *             validators: [emailValidator()]
 *         })
 *     });
 * });
 *
 * // Each item in fields has .name and .email sub-fields
 * fields[0].name.valid // false (empty name)
 * fields[0].email.valid // true (empty email passes emailValidator)
 *
 * // Adding a new person
 * form.value.push({ name: '', email: '' });
 * // fields[1] is now available with its own nested fields
 * ```
 */
export function useFormFieldArray<T, V>(form: FormModel<T[]>, factory: FormFieldFactory<T, V>): V[];

/**
 * Implementation of useFormFieldArray.
 * @internal
 */
export function useFormFieldArray<T>(
    form: FormModel<unknown[]>,
    validatorsOrFactory: FormFieldFactory<unknown, T> | FormValidator<unknown>[] | undefined,
): FormField[] {
    const fields = reactive<FieldWithScope[]>([]);
    const factory = getFactory(form, validatorsOrFactory);

    watch(
        () => form.value.length,
        (newLength, oldLength = 0) => {
            if (newLength > oldLength) {
                for (let i = oldLength; i < newLength; i++) {
                    const scope = effectScope();
                    const field = scope.run(() => factory(i)) as FieldWithScope;
                    field[SCOPE] = scope;

                    fields.push(field);
                }
            } else if (newLength < oldLength) {
                for (let i = oldLength - 1; i >= newLength; i--) {
                    fields[i]![SCOPE].stop();
                }

                fields.length = newLength;
            }
        },
        { immediate: true },
    );

    return fields as FormField[];
}

function getFactory(
    form: FormModel<unknown[]>,
    validatorsOrFactory: FormFieldFactory | FormValidator<unknown>[] | undefined,
) {
    if (typeof validatorsOrFactory === 'function') {
        return (index: number) => {
            const value = computed({
                get: () => form.value[index]!,
                set: value => {
                    form.value[index] = value;
                },
            });

            const field = useFormField(form, { value });

            return validatorsOrFactory(field, index);
        };
    }

    return (index: number) => {
        const value = computed({
            get: () => form.value[index]!,
            set: value => {
                form.value[index] = value;
            },
        });

        return useFormField(form, {
            value,
            validators: validatorsOrFactory,
        });
    };
}
