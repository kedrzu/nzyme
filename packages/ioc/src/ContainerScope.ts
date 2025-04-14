/**
 * Represents a scope for a container that controls service resolution and lifecycle.
 * Scopes are used to:
 * - Control service visibility in child containers
 * - Manage service lifecycle
 * - Implement custom resolution strategies
 */
export type ContainerScope = {
    /**
     * Unique identifier for the scope.
     * Used for debugging and identification purposes.
     */
    readonly name: string;
};

/**
 * Creates a new immutable container scope with the specified name.
 * The scope object is frozen to prevent modifications after creation.
 * @param name - Unique identifier for the scope
 * @returns A frozen scope object that cannot be modified
 */
// #__NO_SIDE_EFFECTS__
export function defineScope(name: string) {
    return Object.freeze({
        name,
    });
}
