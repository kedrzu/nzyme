/**
 *
 */
export type Translation<T = void> = T extends void
    ? (lang: string) => string | unknown[] | undefined
    : (lang: string, params: T) => string | unknown[] | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TranslationAny = Translation<any>;

export type TranslationParams<T extends TranslationAny> =
    T extends Translation<infer P> ? P : never;
