import type { AbstractConstructor } from './Constructors.js';

/** A decorator that can be applied to class properties, optionally returning a value. */
export interface PropertyDecorator<TResult = void> {
    (target: PropertyDecoratorTarget, propertyKey: string): TResult;
}

/** The target object passed to a property decorator - provides access to the constructor. */
export interface PropertyDecoratorTarget {
    /** The constructor function of the class that owns the decorated property. */
    constructor: AbstractConstructor;
}
