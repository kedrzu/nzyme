// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FunctionParams<F extends (...args: any[]) => any> = F extends (...args: infer A) => any ? A : never;
