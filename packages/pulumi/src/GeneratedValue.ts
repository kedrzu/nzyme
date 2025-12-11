import * as pulumi from '@pulumi/pulumi';

/**
 * Arguments for the GeneratedValue resource
 */
export interface GeneratedValueArgs<T> {
    /**
     * Generator function that produces the value. Called once during resource creation.
     * Can be synchronous or asynchronous.
     */
    generate: () => Promise<T> | T;

    /**
     * Whether to mark the output value as secret in Pulumi state.
     * @default false
     */
    secret?: boolean;
}

/**
 * Internal state stored in Pulumi for the GeneratedValue resource
 */
interface GeneratedValueState<T> {
    /**
     * The generated value
     */
    value: T;
}

/**
 * Provider implementation for GeneratedValue dynamic resource
 */
class GeneratedValueProvider<T> implements pulumi.dynamic.ResourceProvider {
    private readonly generator: () => Promise<T> | T;

    /**
     * Creates a new GeneratedValueProvider instance
     */
    constructor(generator: () => Promise<T> | T) {
        this.generator = generator;
    }

    /**
     * Called when the resource is first created. Executes the generator function.
     */
    async create(_inputs: unknown): Promise<pulumi.dynamic.CreateResult> {
        const value = await this.generator();

        return {
            id: Date.now().toString(),
            outs: { value },
        };
    }

    /**
     * Called during updates. Returns the existing value unchanged to prevent regeneration.
     */
    update(_id: string, olds: GeneratedValueState<T>, _news: unknown): Promise<pulumi.dynamic.UpdateResult> {
        // Never regenerate - return existing value unchanged
        return Promise.resolve({
            outs: olds,
        });
    }

    /**
     * Called when reading existing resource state. Returns the value as-is.
     */
    read(id: string, props: GeneratedValueState<T>): Promise<pulumi.dynamic.ReadResult> {
        return Promise.resolve({
            id,
            props,
        });
    }

    /**
     * Called to determine if the resource needs to be updated. Always returns no changes.
     */
    diff(_id: string, _olds: GeneratedValueState<T>, _news: unknown): Promise<pulumi.dynamic.DiffResult> {
        // Never report changes to prevent regeneration
        return Promise.resolve({
            changes: false,
        });
    }
}

/**
 * A Pulumi resource that generates a value once using a custom generator function
 * and persists it across deployments.
 *
 * The generator function is called only once during the initial resource creation.
 * Subsequent deployments will reuse the previously generated value without calling
 * the generator again.
 *
 * @example
 * ```typescript
 * const apiKey = new GeneratedValue('apiKey', {
 *   generate: () => generateSecureToken(),
 *   secret: true,
 * });
 *
 * // Use the generated value
 * const config = new SomeResource('config', {
 *   apiKey: apiKey.value,
 * });
 * ```
 */
export class GeneratedValue<T> extends pulumi.dynamic.Resource {
    /**
     * The generated value. Marked as secret if the `secret` argument was true.
     */
    declare readonly value: pulumi.Output<T>;

    /**
     * Creates a new GeneratedValue resource
     *
     * @param name - The unique name of the resource
     * @param args - Configuration arguments for the resource
     * @param opts - Optional resource options
     */
    constructor(name: string, args: GeneratedValueArgs<T>, opts?: pulumi.CustomResourceOptions) {
        const provider = new GeneratedValueProvider<T>(args.generate);

        super(
            provider,
            name,
            { value: undefined },
            {
                ...opts,
                additionalSecretOutputs: args.secret ? ['value'] : [],
            },
        );
    }
}
