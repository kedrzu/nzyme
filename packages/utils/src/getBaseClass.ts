import type { AbstractConstructor } from '@nzyme/types/Constructors.js';

/**
 * Gets the base class (parent class) of a given constructor.
 * This is useful for traversing the inheritance chain of classes.
 *
 * @param ctor - The constructor to get the base class of
 * @returns The constructor of the base class, or undefined if there is no base class
 *
 * @example
 * ```typescript
 * class Base {}
 * class Derived extends Base {}
 *
 * const base = getBaseClass(Derived);
 * console.log(base === Base); // true
 * ```
 */
export function getBaseClass(ctor: AbstractConstructor) {
    const proto = Object.getPrototypeOf(ctor.prototype) as {
        constructor: AbstractConstructor | undefined;
    };

    return proto.constructor;
}
