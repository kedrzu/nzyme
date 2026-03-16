/** The result of resolving a translation - a string, an array of interpolation parts, or undefined if missing. */
export type TranslationResult = string | unknown[] | undefined;

/** A translation function, optionally parameterized with interpolation params. */
export type Translation<T = void> = T extends void ? TranslationSimple : TranslationWithParams<T>;

/** A translation function that takes only a language code. */
export type TranslationSimple = (lang: string) => TranslationResult;

/** A translation function that takes a language code and interpolation parameters. */
export type TranslationWithParams<T> = (lang: string, params: T) => TranslationResult;

/** A translation function with any parameter type, useful for generic handling. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TranslationAny = Translation<any>;

/** Extracts the parameter type from a translation function. */
export type TranslationParams<T extends TranslationAny> = T extends Translation<infer P> ? P : never;
