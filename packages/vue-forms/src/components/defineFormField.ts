import { computed, onBeforeUnmount, reactive, ref, unref } from 'vue';
import type { ExtractPropTypes, PropType } from 'vue';

import { scrollToTopElement } from '@nzyme/dom-utils';
import { defineProp, injectContext, useInstanceProxy } from '@nzyme/vue-utils';

import { FormContext } from '../FormContext.js';
import type { Validation } from '../validation.js';

export type FormField<T> = ReturnType<typeof createFormField<T>>;

export type FormFieldDefinition<T> = ReturnType<typeof defineFormField<T>>;

export interface FormFieldOptions<T> {
    props: FormFieldProps<T>;
}
export type FormFieldProps<T> = ExtractPropTypes<FormFieldPropsDefinition<T>>;

export type FormFieldPropsDefinition<T> = FormFieldDefinition<T>['props'];

/*#__NO_SIDE_EFFECTS__*/
export function defineFormField<T>(type?: PropType<null | T | undefined>) {
    return {
        props: {
            modelValue: { type: type as PropType<null | T | undefined> },
            field: defineProp<Validation<null | T>>(),
            errors: defineProp<string | string[]>(),
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

    const value = computed<null | T | undefined>({
        get: getValue,
        set: setValue,
    });

    const focused = ref(false);

    const pending = computed(() => {
        return !!props.field?.$pending;
    });

    const errors = computed(() => {
        if (focused.value) {
            return [];
        }

        const errors = Array.isArray(props.errors)
            ? props.errors.slice()
            : props.errors
              ? [props.errors]
              : [];

        if (!props.field?.$error) {
            return errors;
        }

        // Find all the errors in the field
        // Props with name starting with $ are internal to vuelidate
        const field = props.field;

        for (const error of field.$errors) {
            errors.push(unref(error.$message));
        }

        return errors;
    });

    const ok = computed(() => {
        const field = props.field;

        return (
            field &&
            field.$model != null &&
            // should not be empty string
            !(typeof field.$model === 'string' && field.$model === '') &&
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
        return props.field ? props.field.$model : (props.modelValue as null | T | undefined);
    }

    function setValue(value: null | T | undefined) {
        const current = getValue();
        if (value === current) {
            return;
        }

        if (props.field) {
            props.field.$model = value ?? null;
        }

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
