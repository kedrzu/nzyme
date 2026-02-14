import type { AbstractConstructor } from './Constructors.js';

/**
 *
 */
export interface PropertyDecorator<TResult = void> {
    (target: PropertyDecoratorTarget, propertyKey: string): TResult;
}

/**
 *
 */
export interface PropertyDecoratorTarget {
    /**
     *
     */
    constructor: AbstractConstructor;
}
