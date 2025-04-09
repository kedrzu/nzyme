import type { CommandClass } from 'clipanion';
import { Builtins, Cli, Command as CommandBase } from 'clipanion';

import type { Container } from '@nzyme/ioc';
import { createContainer, resolveDeps } from '@nzyme/ioc';

import type { Command, CommandAny } from './defineCommand.js';

/**
 * Options for creating a CLI program
 */
export interface ProgramOptions {
    /** Name of the CLI program */
    name: string;
    /** Optional title for the CLI program */
    title?: string;
    /** Optional dependency injection container */
    container?: Container;
    /** List of commands to register */
    commands: CommandAny[];
}

/**
 * Interface representing a CLI program
 */
export interface Program {
    /** Run the program with optional arguments */
    run: (args?: string[]) => Promise<number>;
    /** Run the program and exit with the result code */
    runAndExit: (args?: string[]) => Promise<void>;
}

/**
 * Creates a new CLI program
 * @param program - Program configuration options
 * @returns Program instance
 */
export function defineProgram(program: ProgramOptions): Program {
    const cli = new Cli({
        binaryName: program.name,
        binaryLabel: program.title,
    });

    const container = program.container ?? createContainer();
    for (const command of program.commands) {
        const commandClass = createCommandClass(command as Command, container);
        cli.register(commandClass);
    }

    cli.register(Builtins.HelpCommand);
    cli.register(Builtins.VersionCommand);

    return {
        run: (args = process.argv.slice(2)) => cli.run(args),
        runAndExit: (args = process.argv.slice(2)) => cli.runExit(args),
    };
}

function createCommandClass(command: Command, container: Container) {
    const commandClass: CommandClass = class extends CommandBase {
        constructor() {
            super();
            Object.assign(this, command.args);
        }

        override async execute() {
            const deps = command.deps ? resolveDeps(command.deps, container) : {};
            await command.execute({ args: this as Record<string, unknown>, deps });
        }
    };

    commandClass.paths = createCommandPaths(command.path);
    commandClass.usage = CommandBase.Usage({
        category: command.category,
        description: command.description,
        details: command.details,
        examples: command.examples,
    });

    return commandClass;
}

function createCommandPaths(path: string | string[]) {
    if (typeof path === 'string') {
        return [path.split(' ')];
    }

    return path.map(p => p.split(' '));
}
