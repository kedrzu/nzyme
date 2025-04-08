import type { CommandClass } from 'clipanion';
import { Builtins, Cli, Command as CommandBase } from 'clipanion';

import type { Container } from '@nzyme/ioc';
import { createContainer, resolveDeps } from '@nzyme/ioc';

import type { Command, CommandAny } from './defineCommand.js';

export interface ProgramOptions {
    name: string;
    title?: string;
    container?: Container;
    commands: CommandAny[];
}

export interface Program {
    run: (args?: string[]) => Promise<number>;
    runAndExit: (args?: string[]) => Promise<void>;
}

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
            await command.exec({ args: this as Record<string, unknown>, deps });
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
        return [[path]];
    }

    return path.map(p => p.split(' '));
}
