/**
 * Sometimes when importing CJS from ESM context types are not properly inferred.
 */
export function unwrapCjsDefaultImport<T>(value: T | { default: T }) {
    return value as T;
}
