import type {
    BaseValidation,
    Validation as ValidationImport,
    ValidationRuleCollection,
    ValidationRule,
} from '@vuelidate/core';

export type Validation<T> = BaseValidation<T>;

// Vuelidate has some bad typing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ValidationNested<T> = T extends Record<any, any> | any[]
    ? ValidationImport<ValidationArgs<T>, T>
    : Validation<T>;

export type ValidationArgs<T = unknown> =
    Partial<{
        [key in keyof T]:
            | ValidationArgs<T[key]>
            | ValidationRuleCollection<T[key]>
            | ValidationRule<T[key]>;
    }> &
        T extends Array<infer V>
        ? { $each: ValidationArgs<V> }
        : {
              //
          };
