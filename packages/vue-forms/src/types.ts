import type { MaybeRefOrGetter } from 'vue';

import type { Language, TranslationResult } from '@nzyme/i18n';
import type { DataSourceDebounceOptions } from '@nzyme/vue-utils';

/**
 *
 */
export interface FormBase<T = unknown> {
    /**
     * Current form value
     */
    value: T;

    /**
     * Parent form
     */
    readonly form: FormModel<unknown>;

    /**
     * Whether the form is valid
     */
    readonly valid: boolean;

    /**
     * Validate form
     * @returns Promise that resolves to true if form is valid, false otherwise
     */
    readonly validate: () => Promise<boolean>;

    /**
     * Reset form validation state
     */
    readonly reset: () => void;
}

/**
 * Form model
 */
export interface FormModel<T = unknown> extends FormBase<T>, FormValidationContext {
    /**
     * Form fields registered in the form
     */
    readonly fields: readonly FormField[];
}

/**
 * Form field model
 */
export interface FormField<T = unknown> extends FormBase<T> {
    /**
     * Whether the field is focused
     */
    readonly focused: boolean;

    /**
     * Validation errors
     */
    readonly errors: string[];

    /**
     * Form validators
     */
    readonly validators: FormValidatorState[];

    /**
     * Focus the field
     */
    readonly focus: () => void;

    /**
     * Blur the field
     */
    readonly blur: () => void;
}

/**
 * Form validation result
 */
export type FormValidationResult = TranslationResult | false | null;

/**
 * Form validation context
 */
export interface FormValidationContext {
    /**
     * Current language
     */
    readonly lang: Language;
}

/**
 *
 */
export interface FormValidatorState {
    /**
     * Validation error
     */
    readonly error: string | null;

    /**
     * Whether to show the validation errors
     */
    show: boolean;

    /**
     *
     */
    readonly validate: () => boolean | Promise<boolean>;
}

/**
 *
 */
export type FormValidatorBehaviorContext<T> = {
    /**
     * Current field value
     */
    readonly value: T | null | undefined;

    /**
     * Whether the field is focused
     */
    readonly focused: boolean;

    /**
     * Whether to show the validation errors
     */
    show: boolean;
};

/**
 * Form validator sync
 * @template T - Type of the value being validated
 */
export type FormValidatorSync<T> = {
    /**
     * Whether the validator is async
     */
    readonly async?: false;

    /**
     * Validate value
     * @param value Value to validate
     * @param ctx Validation context
     * @returns Form validation result
     */
    readonly validate: (value: T | null | undefined, ctx: FormValidationContext) => FormValidationResult;

    /**
     * Form validator behavior
     */
    readonly behavior?: (ctx: FormValidatorBehaviorContext<T>) => void;
};

/**
 * Form validation context async
 */
export interface FormValidationContextAsync<W = unknown> extends FormValidationContext {
    /**
     * Additional watch value.
     */
    readonly watch: W;
}

/**
 * Form validator async
 * @template T - Type of the value being validated
 * @template W - Type of the additional watch value
 */
export type FormValidatorAsync<T, W = unknown> = {
    /**
     * Whether the validator is async
     */
    readonly async: true;

    /**
     * Debounce time in milliseconds or debounce options
     */
    readonly debounce?: number | DataSourceDebounceOptions;

    /**
     * Additional watch value.
     * If provided, the validator will be re-evaluated when the value changes.
     * @example
     * const validator = defineValidator<string>({
     *   async: true,
     *   watch: () => ({ foo: someRef.value }),
     *   validate: (value, ctx) => {
     *     return value.length > 0 && ctx.watch.foo ? undefined : 'Value is required';
     *   },
     * });
     */
    readonly watch?: MaybeRefOrGetter<W>;

    /**
     * Validate value
     * @param value Value to validate
     * @param ctx Validation context
     * @returns Form validation result
     */
    readonly validate: (
        value: T | null | undefined,
        ctx: FormValidationContextAsync<W>,
    ) => Promise<FormValidationResult>;

    /**
     * Form validator behavior
     */
    readonly behavior?: (ctx: FormValidatorBehaviorContext<T>) => void;
};

/**
 *
 */
export type FormValidator<T> = FormValidatorAsync<NonNullable<T>> | FormValidatorSync<NonNullable<T>>;
