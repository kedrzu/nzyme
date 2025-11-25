import * as pulumi from '@pulumi/pulumi';

/**
 * Filters out false, null and undefined values from an array.
 */
export function filterPulumiInput<T>(input: pulumi.Input<T[]>): pulumi.Input<Exclude<T, false | null | undefined>[]> {
    return pulumi
        .all([input])
        .apply(([input]) => (input?.filter((item): item is Exclude<T, false | null | undefined> => item !== false && item != null) ?? []) as Exclude<T, false | null | undefined>[]);
}
