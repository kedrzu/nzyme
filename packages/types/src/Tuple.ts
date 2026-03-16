/** Creates a fixed-length tuple type from up to 10 type parameters, trimming trailing void entries. */
export type Tuple<
    T1 = void,
    T2 = void,
    T3 = void,
    T4 = void,
    T5 = void,
    T6 = void,
    T7 = void,
    T8 = void,
    T9 = void,
    T10 = void,
> = T10 extends void
    ? T9 extends void
        ? T8 extends void
            ? T7 extends void
                ? T6 extends void
                    ? T5 extends void
                        ? T4 extends void
                            ? T3 extends void
                                ? T2 extends void
                                    ? T1 extends void
                                        ? []
                                        : [T1]
                                    : [T1, T2]
                                : [T1, T2, T3]
                            : [T1, T2, T3, T4]
                        : [T1, T2, T3, T4, T5]
                    : [T1, T2, T3, T4, T5, T6]
                : [T1, T2, T3, T4, T5, T6, T7]
            : [T1, T2, T3, T4, T5, T6, T7, T8]
        : [T1, T2, T3, T4, T5, T6, T7, T8, T9]
    : [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10];

/** The widened base type that any Tuple instance is assignable to. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TupleBase<T = any> = Tuple<
    T | void,
    T | void,
    T | void,
    T | void,
    T | void,
    T | void,
    T | void,
    T | void,
    T | void,
    T | void
>;

/** Extracts the union of element types from a Tuple. */
export type TupleValue<T extends TupleBase> = T[keyof T];
