/**
 * Context passed to the {@link mapStacks} factory for each generated stack.
 */
export interface MapStacksContext<K extends string> {
    /**
     * The current key being generated (e.g. a region). The factory uses it to build the stack's
     * name/region and to index same-key dependencies.
     */
    key: K;
}

/**
 * Generate one stack per key, returning a map keyed by that value. The framework is agnostic to what
 * the keys mean — the application supplies the key list (e.g. its regions) and the factory, which
 * builds each stack's name/region. Each key produces a distinct `defineStack` call (a distinct IoC
 * injectable), so the existing dependency-ordered scheduler treats each key's dependency edges
 * independently and deploys them in parallel.
 * @__NO_SIDE_EFFECTS__
 */
export function mapStacks<K extends string, S>(
    keys: readonly K[],
    factory: (context: MapStacksContext<K>) => S,
): Record<K, S> {
    const stacks = {} as Record<K, S>;
    for (const key of keys) {
        stacks[key] = factory({ key });
    }

    return stacks;
}
