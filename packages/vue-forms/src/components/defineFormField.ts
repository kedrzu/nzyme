import { scrollToTopElement } from '@nzyme/dom-utils/scrollToTopElement.js';
import { injectContext } from '@nzyme/vue-utils/context.js';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';
import { onEventEmitter } from '@nzyme/vue-utils/onEventEmitter.js';
import { useInstanceProxy } from '@nzyme/vue-utils/useInstance.js';
import { computed, reactive, ref, useModel } from 'vue';
import type { ExtractPropTypes, PropType, Ref } from 'vue';

import { FormContext } from '../FormContext.js';
import type { FormField as FormFieldModel } from '../types.js';

/**
 * Form field instance type
 */
export type FormFieldController<T> = ReturnType<typeof createFormField<T>>;

/**
 * Form field definition type
 */
export type FormFieldDefinition<T> = ReturnType<typeof defineFormField<T>>;

/**
 * Form field options
 */
export interface FormFieldOptions<T> {
    /**
     * Form field props
     */
    props: FormFieldProps<T>;
}

/**
 * Form field props type
 */
export type FormFieldProps<T> = ExtractPropTypes<FormFieldPropsDefinition<T>>;

/**
 * Form field props definition type
 */
export type FormFieldPropsDefinition<T> = ReturnType<typeof formFieldProps<T>>;

/**
 * Form field value type
 */
export type FormFieldValue<T> = T | null | undefined;

/**
 * Define a form field component with props and emits
 * @param type - Optional prop type for the field value
 * @returns Form field definition with props, emits, and create function
 * @__NO_SIDE_EFFECTS__
 */
export function defineFormField<T>(type?: PropType<T | null | undefined>) {
    return {
        props: formFieldProps<T>(type),
        emits: formFieldEmits<T>(),
        create: createFormField<T>,
    };
}

/** Creates Vue prop definitions for a form field component. */
export function formFieldProps<T>(type?: PropType<T | null | undefined>) {
    return {
        modelValue: { type: type! },
        field: defineProp<
            | FormFieldModel<T>
            | FormFieldModel<T | null>
            | FormFieldModel<T | null | undefined>
            | FormFieldModel<T | undefined>
            | null
            | undefined
        >(),
        errors: defineProp<string | string[]>(),
        required: {} as PropType<boolean | undefined>,
        disabled: Boolean as PropType<boolean>,
        readonly: Boolean as PropType<boolean>,
    };
}

/** Creates Vue emit definitions for a form field component. */
export function formFieldEmits<T>() {
    return {
        'update:modelValue': undefined as unknown as (value: T) => boolean,
        focus: undefined as unknown as (event: FocusEvent) => boolean,
        blur: undefined as unknown as (event: FocusEvent) => boolean,
    };
}

/** Initializes a form field with reactive value, validation errors, and focus tracking. */
export function createFormField<T>(options: FormFieldOptions<T>) {
    const props = options.props;
    const vm = useInstanceProxy();
    const formCtx = injectContext(FormContext, { optional: true });

    const value = computed<FormFieldValue<T>>({
        get: getValue,
        set: setValue,
    });

    const model = useModel(props, 'modelValue') as Ref<FormFieldValue<T>>;
    const focused = ref(false);
    /** The elements this field's focus handlers have fired on: its own inputs. */
    const fieldInputs = new WeakSet<EventTarget>();

    const errors = computed(() => {
        const mergedErrors = Array.isArray(props.errors) ? props.errors.slice() : props.errors ? [props.errors] : [];

        const field = props.field;
        if (field?.errors) {
            mergedErrors.push(...field.errors);
        }

        return mergedErrors;
    });

    const ok = computed(() => {
        const currentValue = getValue();

        return (
            currentValue != null &&
            // should not be empty string
            !(typeof currentValue === 'string' && currentValue.trim() === '') &&
            !errors.value.length
        );
    });

    if (formCtx) {
        onEventEmitter(formCtx.events.submitComplete, scrollToError);
    }

    return reactive({
        value,
        errors,
        focused,
        ok,
        inputAttrs: {
            onFocus,
            onBlur,
        },
    });

    function getValue(): FormFieldValue<T> {
        const field = props.field;
        return field ? field.value : model.value;
    }

    function setValue(newValue: FormFieldValue<T>) {
        const current = getValue();
        if (newValue === current) {
            return;
        }

        if (props.field) {
            props.field.value = newValue;
            // The model is not read while a field is bound, so it may be stale and would skip the emit.
            vm.$emit('update:modelValue', newValue);
            return;
        }

        // `useModel` emits `update:modelValue` itself.
        model.value = newValue;
    }

    function scrollToError() {
        if (errors.value.length && vm.$el) {
            scrollToTopElement(vm.$el as Element, { block: 'center' });
        }
    }

    function onFocus(event: FocusEvent) {
        rememberInput(event);
        if (isFieldInput(event.relatedTarget)) {
            return;
        }

        focused.value = true;
        props.field?.focus();

        // TODO: restore the scroll mechanism
        // // sometimes on mobile input may be covered by a keyboard
        // // to prevent that, after focus we scroll the element into view
        // if (props.scrollIntoElement) {
        //     setTimeout(() => {
        //         inputEl.scrollIntoView({
        //             behavior: 'smooth',
        //             block: 'nearest',
        //         });
        //     }, 300);
        // }

        vm.$emit('focus', event);
    }

    function onBlur(event: FocusEvent) {
        rememberInput(event);
        const target = event.relatedTarget;
        if (isFieldInput(target)) {
            return;
        }

        if (isInsideRoot(target)) {
            // An element inside the field that has not carried its focus handlers yet: either another input of the
            // field, whose `onFocus` runs before the next task and remembers it, or an addon such as a button.
            setTimeout(() => {
                if (!isFieldInput(target)) {
                    leave(event);
                }
            });
            return;
        }

        leave(event);
    }

    function leave(event: FocusEvent) {
        focused.value = false;
        props.field?.blur();
        vm.$emit('blur', event);
    }

    function rememberInput(event: FocusEvent) {
        if (event.currentTarget) {
            fieldInputs.add(event.currentTarget);
        }
    }

    /**
     * Focus moving between the inputs of one field (the segments of a date) neither leaves nor enters it: the
     * browser runs the watchers between that blur and focus, so treating it as a blur would reveal errors mid-entry.
     * Only the elements carrying the field's focus handlers count; focus passing through any other element inside
     * the field (an addon button) leaves it and enters it again.
     */
    function isFieldInput(target: EventTarget | null) {
        return target != null && fieldInputs.has(target);
    }

    function isInsideRoot(target: EventTarget | null) {
        if (typeof Node === 'undefined') {
            return false; // no DOM (server rendering, a custom renderer): nothing to be inside of
        }

        const root: unknown = vm.$el;
        return target instanceof Node && root instanceof Node && root.contains(target);
    }
}
