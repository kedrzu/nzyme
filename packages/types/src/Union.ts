export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void
    ? I
    : never;

type UnionToOvlds<U> = UnionToIntersection<U extends unknown ? (f: U) => void : never>;
export type PopUnion<U> = UnionToOvlds<U> extends (a: infer A) => void ? A : never;
