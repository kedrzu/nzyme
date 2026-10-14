import type { Primitive } from '@nzyme/types/Common.js';
import { defineContext, provideContext } from '@nzyme/vue-utils/context.js';
import { computed, shallowReactive } from 'vue';
import type { ComputedRef } from 'vue';

import { createFormField, formFieldEmits, formFieldProps } from './defineFormField.js';
import type { FormFieldController, FormFieldProps } from './defineFormField.js';

/**
 * Props for a radio group component.
 */
export type RadioGroupProps<T extends Primitive> = FormFieldProps<T>;

interface RadioGroupContext {
    field: FormFieldController<Primitive>;
    props: RadioGroupProps<Primitive>;
    /** Radios of the group, in registration order. */
    radios: RadioGroupItem[];
    /** The one radio in the tab order: the selected one, else the first enabled one. */
    tabStop: ComputedRef<RadioGroupItem | undefined>;
    /** Enabled radios in document order — the order the arrow keys move through. */
    getEnabledRadios(): RadioGroupItem[];
    /** Focus handler for each radio: the field is focused while any of its radios is. */
    onFocus: (event: FocusEvent) => void;
    /** Blur handler for each radio: focus moving to another radio of the group does not blur the field. */
    onBlur: (event: FocusEvent) => void;
}

interface RadioGroupItem {
    readonly value: Primitive;
    readonly disabled: boolean | undefined;
    readonly element: HTMLElement | null;
    select(): void;
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
 * Provides context to child radio components for coordinated behavior, and returns the group's field so
 * a component wrapping the group can render its errors without a second field over the same props.
 */
export function useRadioGroup<T extends Primitive = Primitive>(props: RadioGroupProps<T>) {
    const field = createFormField<T>({ props });
    const radios = shallowReactive<RadioGroupItem[]>([]);
    const tabStop = computed(() => {
        const enabled = getEnabledRadios();
        return enabled.find(radio => radio.value === field.value) ?? enabled[0];
    });

    provideContext(RadioGroupContext, {
        field,
        props: props,
        radios,
        tabStop,
        getEnabledRadios,
        onFocus,
        onBlur,
    });

    return {
        field,
    };

    function getEnabledRadios() {
        return radios.filter(radio => !radio.disabled).toSorted(compareDocumentOrder);
    }

    function onFocus(event: FocusEvent) {
        if (!field.focused) {
            field.inputAttrs.onFocus(event);
        }
    }

    function onBlur(event: FocusEvent) {
        if (radios.some(radio => radio.element && radio.element === event.relatedTarget)) {
            return;
        }

        field.inputAttrs.onBlur(event);
    }
}

function compareDocumentOrder(a: RadioGroupItem, b: RadioGroupItem) {
    if (!a.element || !b.element) {
        return 0;
    }

    return a.element.compareDocumentPosition(b.element) & a.element.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}
