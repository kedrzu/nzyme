import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { readNzymeConfig } from '../utils/readNzymeConfig.js';
import { readProperty } from '../utils/readProperty.js';

/**
 * Loads the commands of every plugin the repo lists under `nzyme.plugins`, on every invocation.
 * A plugin that fails to load, or a malformed `nzyme.plugins`, only prints a warning naming the path
 * and the cause on stderr — never stdout, which `submodule` workflows parse — and the CLI runs on
 * without it: invoking one of its commands then fails as an unknown command.
 */
export async function loadPlugins(): Promise<CommandClass[]> {
    const root = getProjectRoot();
    const commands: CommandClass[] = [];

    let pluginPaths: string[] = [];
    try {
        pluginPaths = await readPluginPaths(root);
    } catch (error) {
        warnBrokenPlugin(path.join(root, 'package.json'), error);
    }

    for (const pluginPath of pluginPaths) {
        try {
            commands.push(...(await importPluginCommands(root, pluginPath)));
        } catch (error) {
            warnBrokenPlugin(pluginPath, error);
        }
    }

    return commands;
}

async function readPluginPaths(root: string) {
    const nzyme = await readNzymeConfig(root);
    const plugins = isPlainObject(nzyme) ? nzyme.plugins : undefined;
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
    if (!Array.isArray(commands) || !commands.every(isCommandClass)) {
        throw new TypeError('the module must default-export `{ commands: CommandClass[] }`');
    }

    return commands;
}

/** Only the shape is checked: a plugin built on another copy of `@nzyme/cli-core` is unsupported. */
function isCommandClass(value: unknown): value is CommandClass {
    return typeof value === 'function';
}

function warnBrokenPlugin(pluginPath: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(`Warning: cannot load the nzyme plugin ${pluginPath}: ${reason}`);
}
