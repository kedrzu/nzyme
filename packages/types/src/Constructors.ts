/**
 *
 */
export type AbstractConstructor<T = any> = Function & {
    /**
     *
     */
    prototype: T;
    /**
     *
     */
    name: string;
};

/**
 *
 */
export interface Constructor<T = any, TArgs extends any[] = any[]> {
    new (...args: TArgs): T;
    /**
     *
     */
    prototype: T;
    /**
     *
     */
    name: string;
}

/**
 *
 */
export interface DefaultConstructor<T = any> {
    new (): T;
    /**
     *
     */
    prototype: T;
    /**
     *
     */
    name: string;
}
