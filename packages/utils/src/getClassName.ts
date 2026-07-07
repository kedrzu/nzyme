import type { AbstractConstructor } from '@nzyme/types/Constructors.js';

/**
 * Gets the name of an object's class.
 * Works with both class instances and constructor functions.
 * @util
 *
 * @param obj - The object or constructor to get the class name of
 * @returns The name of the class, or undefined if it cannot be determined
 *
 * @example
 * ```typescript
 * class MyClass {}
 * const instance = new MyClass();
 *
 * console.log(getClassName(instance)); // "MyClass"
 * console.log(getClassName(MyClass)); // "MyClass"
 * ```
 */
export function getClassName(obj: object) {
    if (typeof obj.constructor === 'function') {
        return obj.constructor.name;
    }

    const proto = Object.getPrototypeOf(obj) as {
        constructor: AbstractConstructor | undefined;
    };

    return proto.constructor?.name;
}
