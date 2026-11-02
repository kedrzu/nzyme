import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';

/**
 * Loads the commands of the plugins the repo lists under `nzyme.plugins`, as far as this invocation
 * needs them:
 *
 * - a built-in command loads no plugin, so a broken one cannot affect it;
 * - with no command to run (no arguments, or a flag such as `--help`), a broken plugin is a warning
 *   on stderr and the rest of the CLI carries on;
 * - anything else may be a plugin's command, so a broken plugin prints its path and the cause on
 *   stderr and exits with 1. Which plugin owns the command is unknowable until all have loaded.
 *
 * @param args - The arguments after the binary name.
 * @param builtins - The binary's own commands.
 */
export async function loadPlugins(args: string[], builtins: CommandClass[]): Promise<CommandClass[]> {
    const firstArg = args[0];
    if (firstArg !== undefined && isBuiltinPath(firstArg, builtins)) {
        return [];
    }

    const report = firstArg === undefined || firstArg.startsWith('-') ? warnAboutPlugin : exitOnBrokenPlugin;
    const root = getProjectRoot();
    const commands: CommandClass[] = [];

    let pluginPaths: string[] = [];
    try {
        pluginPaths = await readPluginPaths(root);
    } catch (error) {
        report(path.join(root, 'package.json'), error);
    }

    for (const pluginPath of pluginPaths) {
        try {
            commands.push(...(await importPluginCommands(root, pluginPath)));
        } catch (error) {
            report(pluginPath, error);
        }
    }

    return commands;
}

function isBuiltinPath(firstArg: string, builtins: CommandClass[]) {
    return builtins.some(command => command.paths?.some(commandPath => commandPath[0] === firstArg));
}

async function readPluginPaths(root: string) {
    const manifest: unknown = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const plugins = readProperty(readProperty(manifest, 'nzyme'), 'plugins');
    if (plugins === undefined) {
        return [];
    }

    if (!Array.isArray(plugins) || !plugins.every(plugin => typeof plugin === 'string')) {
        throw new Error('`nzyme.plugins` must be an array of paths');
    }

    return plugins;
}

async function importPluginCommands(root: string, pluginPath: string) {
    const module: unknown = await import(pathToFileURL(path.resolve(root, pluginPath)).href);
    const commands = readProperty(readProperty(module, 'default'), 'commands');
    if (!Array.isArray(commands)) {
        throw new TypeError('the module must default-export `{ commands: CommandClass[] }`');
    }

    const validated: CommandClass[] = [];
    const listed: unknown[] = commands;
    for (const command of listed) {
        if (typeof command !== 'function') {
            throw new TypeError('the module must default-export `{ commands: CommandClass[] }`');
        }

        if (!isCommandClass(command)) {
            throw new TypeError(
                `command ${command.name} does not extend the \`Command\` of the \`@nzyme/cli-core\` this binary runs: ` +
                    'use one version of `@nzyme/*`, installed in this repo',
            );
        }

        validated.push(command);
    }

    return validated;
}

function isCommandClass(value: unknown): value is CommandClass {
    return typeof value === 'function' && value.prototype instanceof Command;
}

function readProperty(value: unknown, key: string): unknown {
    if (typeof value !== 'object' || value === null || !(key in value)) {
        return undefined;
    }

    return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function warnAboutPlugin(pluginPath: string, cause: unknown) {
    console.warn(describeFailure(pluginPath, cause));
}

function exitOnBrokenPlugin(pluginPath: string, cause: unknown) {
    console.error(describeFailure(pluginPath, cause));
    process.exit(1);
}

function describeFailure(pluginPath: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return `Cannot load the nzyme plugin ${pluginPath}: ${reason}`;
}
