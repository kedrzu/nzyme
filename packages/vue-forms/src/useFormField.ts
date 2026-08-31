import { arrayRemove } from '@nzyme/utils/array/arrayRemove.js';
import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import { reactive } from '@nzyme/vue-utils/reactivity/reactive.js';
import { useDataSource } from '@nzyme/vue-utils/useDataSource.js';
import type { Ref } from 'vue';
import { computed, onScopeDispose, ref, toRef, watchEffect } from 'vue';

import { showErrorsOnBlurBehavior } from './behaviors/showErrorsOnBlurBahavior.js';
import type {
    FormField,
    FormModel,
    FormValidationContext,
    FormValidationResult,
    FormValidator,
    FormValidatorBehaviorContext,
    FormValidatorState,
} from './types.js';

/**
 * Parameters for creating a form field that uses the parent form's value directly.
 * When value is omitted, the field validates the form's value with the provided validators.
 *
 * This is useful when you want to add validation to an existing form or field
 * without creating a separate value ref.
 *
 * @template T - Type of the form value
 *
 * @example
 * ```typescript
 * const form = useForm({ name: '', email: '' });
 *
 * // Create a field that validates the entire form value
 * const field = useFormField(form, {
 *     validators: [customObjectValidator()]
 * });
 *
 * // field.value is the same as form.value
 * ```
 */
export interface FormFieldBasicParams<T = unknown> {
    /**
     * Optional field value. When undefined, uses the parent form's value directly.
     * This allows creating a field with just validators from an existing form/field.
     */
    value?: undefined;

    /**
     * Validators to apply to this field.
     */
    validators: FormValidator<T>[];
}

/**
 * Parameters for creating a form field with a custom value ref.
 * Use this when the field should track a specific value that may differ from
 * the parent form's value (e.g., a nested property or computed value).
 *
 * @template T - Type of the field value
 *
 * @example
 * ```typescript
 * const form = useForm({ name: '', email: '' });
 *
 * // Create a field for a specific property
 * const nameValue = computed({
 *     get: () => form.value.name,
 *     set: (v) => { form.value.name = v; }
 * });
 *
 * const nameField = useFormField(form, {
 *     value: nameValue,
 *     validators: [requiredValidator()]
 * });
 * ```
 */
export interface FormFieldCustomParams<T = unknown> {
    /**
     * The value ref for this field. Can be a ref or computed.
     */
    value: Ref<T>;

    /**
     * Optional validators to apply to this field.
     */
    validators?: FormValidator<T>[];
}

/**
 * Creates a form field that uses the parent form's value directly with the provided validators.
 *
 * @template T - Type of the form value
 * @param form - Parent form model
 * @param params - Field parameters with validators (value is omitted)
 * @returns A form field that validates the form's value
 *
 * @example
 * ```typescript
 * const form = useForm('');
 * const field = useFormField(form, { validators: [requiredValidator()] });
 * // field.value === form.value
 * ```
 */
export function useFormField<T>(form: FormModel<T>, params: FormFieldBasicParams<T>): FormField<T>;
/**
 * Creates a form field with a custom value ref and optional validators.
 *
 * @template T - Type of the field value
 * @param form - Parent form model (for registration and context)
 * @param params - Field parameters with custom value and optional validators
 * @returns A form field that validates the custom value
 *
 * @example
 * ```typescript
 * const form = useForm({ name: '', email: '' });
 * const nameRef = computed({
 *     get: () => form.value.name,
 *     set: (v) => { form.value.name = v; }
 * });
 * const nameField = useFormField(form, {
 *     value: nameRef,
 *     validators: [requiredValidator()]
 * });
 * ```
 */
export function useFormField<T>(form: FormModel, params: FormFieldCustomParams<T>): FormField<T>;
/**
 * Implementation of useFormField.
 * @internal
 */
export function useFormField(form: FormModel, params: FormFieldBasicParams | FormFieldCustomParams): FormField {
    const focused = ref(false);
    const value = params.value ?? toRef(form, 'value');
    const validators = params.validators?.map(validator => createValidatorState(validator, value, focused, form)) || [];

    const errors = computed(() => {
        const fieldErrors: string[] = [];
        for (const validator of validators) {
            if (!validator.show) {
                continue;
            }

            const error = validator.error;
            if (error) {
                fieldErrors.push(error);
            }
        }

        return fieldErrors;
    });

    const fields = reactive<FormField[]>([]);

    const valid = computed(() => {
        return validators.every(validator => validator.error == null) && fields.every(field => field.valid);
    });

    const invalid = computed(() => {
        return errors.value.length > 0 || fields.some(field => field.invalid);
    });

    const field = reactive<FormField>({
        form,
        value,
        fields,
        lang: form.lang,
        valid,
        invalid,
        errors,
        focused,
        validators,
        validate,
        reset,
        focus,
        blur,
    });

    const formFields = form.fields as FormField[];

    // Register field in form
    formFields.push(field);

    // Unregister field from form when component is unmounted
    onScopeDispose(() => {
        arrayRemove(formFields, field);
    });

    return field;

    function focus() {
        focused.value = true;
    }

    function blur() {
        focused.value = false;
    }

    async function validate() {
        const promises: Promise<boolean>[] = [];
        let isValid = true;

        for (const validator of validators) {
            const result = validator.validate();

            if (result instanceof Promise) {
                promises.push(result);
            } else {
                isValid = isValid && result;
            }
        }

        // Also validate nested fields
        for (const nestedField of fields) {
            promises.push(nestedField.validate());
        }

        if (promises.length > 0) {
            const results = await Promise.all(promises);
            return isValid && results.every(result => result);
        }

        return isValid;
    }

    function reset() {
        for (const validator of validators) {
            validator.show = false;
        }

        // Also reset nested fields
        for (const nestedField of fields) {
            nestedField.reset();
        }
    }
}

function createValidatorState<T>(
    validator: FormValidator<T>,
    value: Readonly<Ref<T>>,
    focused: Readonly<Ref<boolean>>,
    ctx: FormValidationContext,
) {
    if (validator.async) {
        return createValidatorStateAsync(validator, value, focused, ctx);
    } else {
        return createValidatorStateSync(validator, value, focused, ctx);
    }
}

function createValidatorStateSync<T>(
    validator: FormValidator<T> & { async?: false },
    value: Readonly<Ref<T>>,
    focused: Readonly<Ref<boolean>>,
    ctx: FormValidationContext,
) {
    const error = ref<string | null>(null);
    const show = ref(false);

    watchEffect(refresh);
    createValidatorBehavior(validator, { value, focused, show });

    return reactive<FormValidatorState>({
        error,
        show,
        validate: () => {
            refresh();
            show.value = true;
            return !error.value;
        },
    });

    function refresh() {
        error.value = normalizeErrors(validator.validate(value.value as NonNullable<T> | null | undefined, ctx));
    }
}

function createValidatorStateAsync<T>(
    validator: FormValidator<T> & { async: true },
    value: Readonly<Ref<T>>,
    focused: Readonly<Ref<boolean>>,
    ctx: FormValidationContext,
) {
    const watch = makeRef(validator.watch);

    const error = useDataSource({
        params: () => ({ value: value.value, watch: watch.value }),
        load: async params => {
            const result = await validator.validate(params.value as NonNullable<T> | null | undefined, {
                ...ctx,
                watch: params.watch,
            });
            return normalizeErrors(result);
        },
        default: null,
        debounce: validator.debounce,
        behavior: 'eager',
    });

    const show = ref(false);

    createValidatorBehavior(validator, { value, focused, show });

    return reactive<FormValidatorState>({
        error: toRef(error, 'value'),
        show,
        validate: async () => {
            await error.reload();
            show.value = true;
            return !error.value;
        },
    });
}

function createValidatorBehavior<T>(validator: FormValidator<T>, ctx: FormValidatorBehaviorContext<T>) {
    if (validator.behavior) {
        validator.behavior(ctx as FormValidatorBehaviorContext<NonNullable<T>>);
    } else {
        showErrorsOnBlurBehavior(ctx);
    }
}

function normalizeErrors(error: FormValidationResult) {
    if (!error) {
        return null;
    }

    if (typeof error === 'string') {
        return error;
    }

    if (Array.isArray(error)) {
        return error.join('');
    }

    return null;
}
