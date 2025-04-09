import type { ResolveDependencies, ServiceDependencies } from '@nzyme/ioc';
import type { SomeObject } from '@nzyme/types';

/**
 * Interface defining a CLI command structure
 * @template TArgs - Type of command arguments
 * @template TDeps - Type of service dependencies
 */
export interface Command<
    TArgs extends Record<string, unknown> = Record<string, unknown>,
    TDeps extends ServiceDependencies = ServiceDependencies,
> {
    /** Command path or paths in the CLI */
    path: string | string[];
    /** Optional category for command grouping */
    category?: string;
    /** Short description of the command */
    description?: string;
    /** Detailed description of the command */
    details?: string;
    /** Example usage of the command */
    examples?: [title: string, command: string][];
    /** Command arguments definition */
    args?: TArgs;
    /** Service dependencies required by the command */
    deps?: TDeps;
    /** Command execution function */
    execute: (params: CommandParams<TArgs, TDeps>) => Promise<void> | void;
}

/**
 * Any command definition
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandAny = Command<any, any>;

/**
 * Parameters passed to command execution function
 * @template TArgs - Type of command arguments
 * @template TDeps - Type of service dependencies
 */
export interface CommandParams<TArgs extends object, TDeps extends ServiceDependencies> {
    /** Command arguments */
    args: TArgs;
    /** Resolved service dependencies */
    deps: ResolveDependencies<TDeps>;
}

/**
 * Creates a new CLI command definition
 * @template TDeps - Type of service dependencies
 * @template TArgs - Type of command arguments
 * @param command - Command configuration object
 * @returns The command definition
 */
export function defineCommand<
    TDeps extends ServiceDependencies = SomeObject,
    TArgs extends Record<string, unknown> = SomeObject,
>(command: Command<TArgs, TDeps>) {
    return command;
}
