import type { ResolveDependencies, ServiceDependencies } from '@nzyme/ioc';
import type { SomeObject } from '@nzyme/types';

export interface Command<
    TArgs extends Record<string, unknown> = Record<string, unknown>,
    TDeps extends ServiceDependencies = ServiceDependencies,
> {
    path: string | string[];
    category?: string;
    description?: string;
    details?: string;
    examples?: [title: string, command: string][];
    args?: TArgs;
    deps?: TDeps;
    exec: (params: CommandParams<TArgs, TDeps>) => Promise<void> | void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandAny = Command<any, any>;

export interface CommandParams<TArgs extends object, TDeps extends ServiceDependencies> {
    args: TArgs;
    deps: ResolveDependencies<TDeps>;
}

export function defineCommand<
    TDeps extends ServiceDependencies = SomeObject,
    TArgs extends Record<string, unknown> = SomeObject,
>(command: Command<TArgs, TDeps>) {
    return command;
}
