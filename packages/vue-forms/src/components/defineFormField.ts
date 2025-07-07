import type { MaybeOutput, RegleFieldStatus } from '@regle/core';
import { computed, onBeforeUnmount, reactive, ref, useModel, watch } from 'vue';
import type { ExtractPropTypes, PropType, Ref, UnwrapNestedRefs } from 'vue';

import { scrollToTopElement } from '@nzyme/dom-utils';
import { defineProp, injectContext, useInstanceProxy } from '@nzyme/vue-utils';

import { FormContext } from '../FormContext.js';

export type FormField<T> = ReturnType<typeof createFormField<T>>;

export type FormFieldDefinition<T> = ReturnType<typeof defineFormField<T>>;

export interface FormFieldOptions<T> {
    props: FormFieldProps<T>;
}
export type FormFieldProps<T> = ExtractPropTypes<FormFieldPropsDefinition<T>>;

export type FormFieldPropsDefinition<T> = FormFieldDefinition<T>['props'];

export type FormFieldValue<T> = MaybeOutput<UnwrapNestedRefs<T> | null>;

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineFormField<T>(type?: PropType<T | null | undefined>) {
    return {
        props: {
            modelValue: { type: type as PropType<T | null | undefined> },
            field: defineProp<RegleFieldStatus<T | null | undefined>>(),
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

    watch(model, value => {
        console.log('valueInternal', value);
    });

    const focused = ref(false);

    const pending = computed(() => {
        return !!props.field?.$pending;
    });

    const errors = computed(() => {
        if (focused.value) {
            return [];
        }

        const errors = Array.isArray(props.errors) ? props.errors.slice() : props.errors ? [props.errors] : [];

        if (!props.field?.$error) {
            return errors;
        }

        // Find all the errors in the field
        // Props with name starting with $ are internal to vuelidate
        const field = props.field;

        for (const error of field.$errors) {
            errors.push(error);
        }

        return errors;
    });

    const ok = computed(() => {
        const field = props.field;

        return (
            field &&
            field.$value != null &&
            // should not be empty string
            !(typeof field.$value === 'string' && field.$value === '') &&
            !errors.value.length
        );
    });

    if (formCtx) {
        formCtx.on('submitComplete', scrollToError);
        onBeforeUnmount(() => formCtx.off('submitComplete', scrollToError));
    }

    return reactive({
        value,
        errors,
        pending,
        focused,
        ok,
        touch,
        inputAttrs: {
            onFocus,
            onBlur,
        },
    });

    function getValue() {
        return props.field ? props.field.$value : model.value;
    }

    function setValue(value: FormFieldValue<T>) {
        const current = getValue();
        if (value === current) {
            return;
        }

        if (props.field) {
            props.field.$value = value;
        }

        model.value = value;

        vm.$emit('update:modelValue', value);
    }

    function touch() {
        props.field?.$touch();
    }

    function scrollToError() {
        if (errors.value.length && vm.$el) {
            scrollToTopElement(vm.$el as Element);
        }
    }

    function onFocus(event: FocusEvent) {
        focused.value = true;

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
        vm.$emit('blur', event);
    }
}
