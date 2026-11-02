import { Builtins, Cli } from 'clipanion';

import type { Container } from '@nzyme/ioc/Container.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { PrettyCliLoggerTransport } from '@nzyme/logging/PrettyCliLoggerTransport.js';

import type { CommandClass, CommandContext, CommandErrorHandler } from './Command.js';

/**
 * Options for creating a CLI program
 */
export interface ExecuteOptions {
    /** Name of the CLI program */
    name: string;
    /** Optional title for the CLI program */
    title?: string;
    /** List of commands to register */
    commands: CommandClass[];
    /** Container to use for the CLI program */
    container?: Container;
    /**
     * Rewrites any error a command throws before it is reported — one handler for the whole
     * program, so no command has to opt in or be subclassed. See {@link CommandErrorHandler}.
     */
    onError?: CommandErrorHandler;
}

/**
 * Execute a CLI program
 * @param options - Program configuration options
 */
export async function execute(options: ExecuteOptions): Promise<void> {
    const cli = new Cli<CommandContext>({
        binaryName: options.name,
        binaryLabel: options.title,
    });

    const container = options.container ?? createContainer();

    container.register(PrettyCliLoggerTransport);

    for (const command of options.commands) {
        cli.register(command);
    }

    cli.register(Builtins.HelpCommand);
    cli.register(Builtins.VersionCommand);

    await cli.runExit(process.argv.slice(2), { container, onError: options.onError });
}
