/** A single translation entry, mapping language codes to translated strings. */
export type TranslationRaw = {
    [lang: string]: string;
};

/** A collection of translation entries keyed by translation key. */
export type TranslationDocument = {
    [key: string]: TranslationRaw;
};

/** Describes an error encountered during translation file compilation. */
export type TranslationError = {
    /** Column number where the error occurred. */
    column: number;
    /** Translation key associated with the error, if applicable. */
    key?: string;
    /** Language code associated with the error, if applicable. */
    lang?: string;
    /** Line number where the error occurred. */
    line: number;
    /** Human-readable error description. */
    message: string;
};
