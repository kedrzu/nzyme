import { defineInjectable } from './Injectable.js';

/**
 * Special injectable that resolves to the service that requested the injection.
 * This is useful for:
 * - Getting information about the dependency chain
 * - Implementing circular dependency patterns
 * - Accessing the calling service's context
 * - Debugging dependency resolution
 */
export const Caller = defineInjectable({
    name: 'Caller',
    resolve: (_container, service) => service,
});
