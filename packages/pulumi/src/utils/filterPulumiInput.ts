import * as pulumi from '@pulumi/pulumi';

/**
 * Filters out null and undefined values from an array.
 */
export function filterPulumiInput<T>(input: pulumi.Input<T[]>): pulumi.Input<Exclude<T, false | null | undefined>[]> {
    return pulumi
        .all([input])
        .apply(([input]) => (input?.filter(Boolean) ?? []) as Exclude<T, false | null | undefined>[]);
}
