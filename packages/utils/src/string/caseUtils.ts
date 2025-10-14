// Matches any letter followed by an uppercase letter
const CAMEL_TO_SEPARATOR = /([a-z])([A-Z])/g;

/**
 * Options for converting a string to a specific case format.
 */
export type ConvertCaseOptions = {
    /**
     * Join the transformed words with a separator.
     */
    joinWord: (str: string, word: string, index: number) => string;
    /**
     * Transform a word according to the case format.
     */
    transformWord: (word: string, index: number) => string;
};

/**
 * Capitalize the first letter of a string.
 */
export function capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert a string to a specific case format.
 */
export function convertCase(str: string, options: ConvertCaseOptions): string {
    if (str.length === 0) {
        return '';
    }

    // First, convert any existing camelCase to space-separated words
    const words = str.replace(CAMEL_TO_SEPARATOR, (_match, p1, p2) => `${p1} ${p2}`).split(/[\s-_]+/);

    let result = '';
    for (let i = 0; i < words.length; i++) {
        let word = words[i]!;
        if (word.length === 0) {
            continue;
        }

        word = options.transformWord(word, i);

        if (i > 0) {
            result = options.joinWord(result, word, i);
        } else {
            result = word;
        }
    }

    return result;
}

/**
 * Convert a string to camelCase (e.g., "hello world" -> "helloWorld")
 */
export function toCamelCase(str: string): string {
    return convertCase(str, {
        transformWord: (word, index) => {
            if (index === 0) {
                return word.toLowerCase();
            }

            return capitalizeFirstLetter(word);
        },
        joinWord: (result, word) => result + word,
    });
}

/**
 * Convert a string to kebab-case (e.g., "hello world" -> "hello-world")
 */
export function toKebabCase(str: string): string {
    return convertCase(str, {
        transformWord: word => word.toLowerCase(),
        joinWord: (result, word) => `${result}-${word}`,
    });
}

/**
 * Convert a string to PascalCase (e.g., "hello world" -> "HelloWorld")
 */
export function toPascalCase(str: string): string {
    return convertCase(str, {
        transformWord: capitalizeFirstLetter,
        joinWord: (result, word) => result + word,
    });
}

/**
 * Convert a string to snake_case (e.g., "hello world" -> "hello_world")
 */
export function toSnakeCase(str: string): string {
    return convertCase(str, {
        transformWord: word => word.toLowerCase(),
        joinWord: (result, word) => `${result}_${word}`,
    });
}

/**
 * Convert a string to Title Case (e.g., "hello world" -> "Hello World")
 */
export function toTitleCase(str: string): string {
    return convertCase(str, {
        transformWord: capitalizeFirstLetter,
        joinWord: (result, word) => `${result} ${word}`,
    });
}
