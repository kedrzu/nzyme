import type { Primitive } from '@nzyme/types/Common.js';
import { defineContext, provideContext } from '@nzyme/vue-utils/context.js';

import { createFormField, formFieldEmits, formFieldProps } from './defineFormField.js';
import type { FormFieldController, FormFieldProps } from './defineFormField.js';

/**
 * Props for a radio group component.
 */
export type RadioGroupProps<T extends Primitive> = FormFieldProps<T>;

interface RadioGroupContext {
    field: FormFieldController<Primitive>;
    props: RadioGroupProps<Primitive>;
}

/**
 * Context for radio group that provides field controller and props to child radio components.
 */
export const RadioGroupContext = defineContext<RadioGroupContext>('RadioGroup');

/**
 * Returns the props definition for a radio group component.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function getRadioGroupProps<T extends Primitive = Primitive>() {
    return formFieldProps<T>();
}

/**
 * Returns the emits definition for a radio group component.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function getRadioGroupEmits<T extends Primitive = Primitive>() {
    return formFieldEmits<T>();
}

/**
 * Composable for creating a radio group that manages a form field with primitive values.
 * Provides context to child radio components for coordinated behavior.
 */
export function useRadioGroup<T extends Primitive = Primitive>(props: RadioGroupProps<T>) {
    const field = createFormField<T>({ props });
    provideContext(RadioGroupContext, { field, props: props as RadioGroupProps<Primitive> });
}
