import { defineContext, provideContext } from '@nzyme/vue-utils';

import { createFormField, formFieldEmits, formFieldProps } from './defineFormField.js';
import type { FormFieldController, FormFieldProps } from './defineFormField.js';

/**
 *
 */
export type RadioGroupProps<T extends string> = FormFieldProps<T>;

interface RadioGroupContext {
    field: FormFieldController<string>;
    props: RadioGroupProps<string>;
}

/**
 *
 */
export const RadioGroupContext = defineContext<RadioGroupContext>('RadioGroup');

/**
 *
 */
export function getRadioGroupProps<T extends string>() {
    return formFieldProps<T>();
}

/**
 *
 */
export function getRadioGroupEmits<T extends string>() {
    return formFieldEmits<T>();
}

/**
 *
 */
export function useRadioGroup<T extends string>(props: RadioGroupProps<T>) {
    const field = createFormField<T>({ props });
    provideContext(RadioGroupContext, { field, props: props as RadioGroupProps<string> });
}
