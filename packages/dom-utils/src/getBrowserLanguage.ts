/**
 * Gets the preferred language from browser languages based on available languages.
 * Falls back to the first available language if no match is found.
 * Caches the result for performance.
 *
 * @param availableLanguages - Array of available languages from the provider
 * @returns The best matching language code
 * @__NO_SIDE_EFFECTS__
 */
export function getBrowserLanguage<const L extends readonly string[]>(availableLanguages: L): L[number] | undefined {
    if (typeof navigator === 'undefined') {
        return;
    }

    const browserLanguages = (navigator.languages || [navigator.language]) as L[number][];

    // First try exact matches
    for (const browserLang of browserLanguages) {
        if (availableLanguages.includes(browserLang)) {
            return browserLang;
        }
    }

    // Then try partial matches (e.g., 'en-US' matches 'en')
    for (const browserLang of browserLanguages) {
        const langCode = browserLang.split('-')[0] as L[number] | undefined;
        if (langCode && availableLanguages.includes(langCode)) {
            return langCode;
        }
    }
}
