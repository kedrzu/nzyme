/**
 * Extract the parameters from a path
 * @example
 * ```typescript
 * type U = BracedParameters<"/base/{param1}/{param2}/rest">;
 * // "param1" | "param2"
 * ```
 */
export type BracedParameters<Path extends string> = Path extends `${string}{${infer P}}${infer Rest}`
    ? _ParamCore<P> | BracedParameters<Rest>
    : never;

// Pull core name out of "{name}", allowing forms like "{name}" or "{name?:...}" or "{name:...}"
type _ParamCore<P extends string> = P extends `${infer Name}?` ? Name : P extends `${infer Name}:${string}` ? Name : P;
