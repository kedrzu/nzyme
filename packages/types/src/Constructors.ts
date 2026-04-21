/** A possibly abstract class reference - can be used in instanceof checks but not directly instantiated. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AbstractConstructor<T = any> = (abstract new (...args: any[]) => T) & {
    /** The prototype object of the constructor. */
    prototype: T;
    /** The name of the constructor function. */
    name: string;
};

/** A concrete class reference that can be instantiated with `new`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Constructor<T = any, TArgs extends any[] = any[]> {
    new (...args: TArgs): T;
    /** The prototype object of the constructor. */
    prototype: T;
    /** The name of the constructor function. */
    name: string;
}

/** A class that can be instantiated with no arguments. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DefaultConstructor<T = any> {
    new (): T;
    /** The prototype object of the constructor. */
    prototype: T;
    /** The name of the constructor function. */
    name: string;
}
