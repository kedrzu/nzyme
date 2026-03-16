/** Converts a union type into an intersection type using distributive conditional types. */
export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void
    ? I
    : never;

/** Extracts the last member from a union type using function overload inference. */
export type PopUnion<U> = UnionToOvlds<U> extends (a: infer A) => void ? A : never;
type UnionToOvlds<U> = UnionToIntersection<U extends unknown ? (f: U) => void : never>;
