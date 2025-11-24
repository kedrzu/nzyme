import type { Primitive } from '@nzyme/types';
import { defineContext, provideContext } from '@nzyme/vue-utils';

import { createFormField, formFieldEmits, formFieldProps } from './defineFormField.js';
import type { FormFieldController, FormFieldProps } from './defineFormField.js';

/**
 *
 */
export type RadioGroupProps<T extends Primitive> = FormFieldProps<T>;

interface RadioGroupContext {
    field: FormFieldController<Primitive>;
    props: RadioGroupProps<Primitive>;
}

/**
 *
 */
export const RadioGroupContext = defineContext<RadioGroupContext>('RadioGroup');

/**
 *
 */
export function getRadioGroupProps<T extends Primitive = Primitive>() {
    return formFieldProps<T>();
}

/**
 *
 */
export function getRadioGroupEmits<T extends Primitive = Primitive>() {
    return formFieldEmits<T>();
}

/**
 *
 */
export function useRadioGroup<T extends Primitive = Primitive>(props: RadioGroupProps<T>) {
    const field = createFormField<T>({ props });
    provideContext(RadioGroupContext, { field, props: props as RadioGroupProps<string> });
}
