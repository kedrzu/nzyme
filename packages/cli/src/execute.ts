import { Container, createContainer } from '@nzyme/ioc';
import { Builtins, Cli } from 'clipanion';
import { CommandClass, CommandContext } from './Command.js';

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

    for (const command of options.commands) {
        cli.register(command);
    }

    cli.register(Builtins.HelpCommand);
    cli.register(Builtins.VersionCommand);

    await cli.runExit(process.argv.slice(2), { container });
}
