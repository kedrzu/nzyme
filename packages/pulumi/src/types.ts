import type * as pulumi from '@pulumi/pulumi';

/**
 * Unwraps a pulumi.Output or pulumi.Input to its underlying type.
 */
export type UnwrapShallow<T> = T extends pulumi.Output<infer U> ? U : T extends pulumi.Input<infer U> ? U : T;
