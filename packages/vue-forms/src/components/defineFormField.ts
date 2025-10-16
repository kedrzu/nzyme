import { computed, reactive, ref, useModel } from 'vue';
import type { ExtractPropTypes, PropType, Ref } from 'vue';

import { scrollToTopElement } from '@nzyme/dom-utils';
import { defineProp, injectContext, onEventEmitter, useInstanceProxy } from '@nzyme/vue-utils';

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
export type FormFieldPropsDefinition<T> = FormFieldDefinition<T>['props'];

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
        props: {
            modelValue: { type: type as PropType<T | null | undefined> },
            field: defineProp<FormFieldModel<T>>(),
            errors: defineProp<string | string[]>(),
            required: Boolean,
            disabled: Boolean,
            readonly: Boolean,
        },
        emits: {
            'update:modelValue': undefined as unknown as (value: T) => boolean,
            focus: undefined as unknown as (event: FocusEvent) => boolean,
            blur: undefined as unknown as (event: FocusEvent) => boolean,
        },
        create: createFormField<T>,
    };
}

function createFormField<T>(options: FormFieldOptions<T>) {
    const props = options.props;
    const vm = useInstanceProxy();
    const formCtx = injectContext(FormContext, { optional: true });

    const value = computed<FormFieldValue<T>>({
        get: getValue,
        set: setValue,
    });

    const model = useModel(props, 'modelValue') as Ref<FormFieldValue<T>>;
    const focused = ref(false);



    const errors = computed(() => {
        if (focused.value) {
            return [];
        }

        const errors = Array.isArray(props.errors) ? props.errors.slice() : props.errors ? [props.errors] : [];

        const field = props.field;
        if (field?.errors) {
            errors.push(...field.errors);
        }

        return errors;
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

    function setValue(value: FormFieldValue<T>) {
        const current = getValue();
        if (value === current) {
            return;
        }

        if (props.field) {
            props.field.value = value as T;
        }

        model.value = value;

        vm.$emit('update:modelValue', value);
    }

 

    function scrollToError() {
        if (errors.value.length && vm.$el) {
            scrollToTopElement(vm.$el as Element);
        }
    }

    function onFocus(event: FocusEvent) {
        focused.value = true;
        props.field?.focus();

        // TODO przywrócić mechanizm scrollowania
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
        focused.value = false;
        props.field?.blur();
        vm.$emit('blur', event);
    }
}
