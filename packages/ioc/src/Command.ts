import type { EmptyObject, OmitProps } from '@nzyme/types';
import { createMemo } from '@nzyme/utils';

import { defineService, type Service, type Dependencies, type ServiceOptions } from './Service.js';
import { defineResolutionStrategy, singletonStrategy } from './serviceResolve.js';

/**
 * Represents a command as a specialized service with singleton resolution.
 * Commands are services that encapsulate business logic and are resolved as singletons.
 *
 * @template T - Type of the command function
 */
export type Command<T extends CommandFunction = CommandFunction> = Service<T>;

/**
 * Represents a command function that can be executed with parameters.
 * Commands are specialized services that encapsulate business logic or operations.
 *
 * @template P - Array of parameter types that the command accepts
 * @template R - Return type of the command execution
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandFunction<P extends any[] = any[], R = unknown> = (...params: P) => R;

/**
 * Configuration options for defining a command.
 * Extends ServiceOptions but excludes resolution strategy as commands use a fixed strategy.
 *
 * @template T - Type of the command function
 * @template TExtend - Extended type of the command function (for inheritance)
 * @template TDeps - Dependencies required by the command
 */
export type CommandOptions<
    T extends CommandFunction,
    TExtend extends T = T,
    TDeps extends Dependencies = EmptyObject,
> = OmitProps<ServiceOptions<T, TExtend, TDeps>, 'resolution'>;

/**
 * Extracts the result type of a command, including handling of Promise results.
 *
 * @template T - Type of the command
 * @returns The resolved return type of the command, handling both sync and async results
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandResult<T extends Command<any>> = T extends Command<infer R> ? Awaited<ReturnType<R>> : never;

/**
 * Creates a new command with the specified options.
 * Commands are resolved as singletons and their results are memoized.
 *
 * @template T - Type of the command function
 * @template TExtend - Extended type of the command function (for inheritance)
 * @template TDeps - Dependencies required by the command
 * @param options - Configuration options for the command
 * @returns A new command instance
 * @__NO_SIDE_EFFECTS__
 */
export function defineCommand<
    T extends CommandFunction,
    TExtend extends T = T,
    TDeps extends Dependencies = EmptyObject,
>(options: ServiceOptions<T, TExtend, TDeps>) {
    return defineService<T, TExtend, TDeps>({
        ...options,
        resolution: commandStrategy,
    });
}

/**
 * Custom resolution strategy for commands.
 * Ensures commands are:
 * - Resolved as singletons
 * - Properly memoized for performance
 * - Maintain consistent execution context
 */
const commandStrategy = defineResolutionStrategy((service, container, caller) => {
    const memo = createMemo(() => singletonStrategy(service, container, caller) as CommandFunction);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const command: CommandFunction = (...args) => memo()(...args);

    return command;
});
