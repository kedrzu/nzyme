#!/usr/bin/env -S bun --enable-source-maps --conditions=source

import { execute } from '@nzyme/cli-core/execute.js';
import { initialize } from '@nzyme/cli-core/initialize.js';
import { loadEnvVariables } from '@nzyme/project-utils/loadEnvVariables.js';

import { DepcheckCommand } from './commands/DepcheckCommand.js';
import { GitAffectedCommand } from './commands/GitAffectedCommand.js';
import { GitBaseCommand } from './commands/GitBaseCommand.js';
import { IndexCommand } from './commands/IndexCommand.js';
import { LocaliseCommand } from './commands/LocaliseCommand.js';
import { MonorepoCommand } from './commands/MonorepoCommand.js';
import { QuietRunCommand } from './commands/QuietRunCommand.js';
import { SubmoduleBumpCommand } from './commands/SubmoduleBumpCommand.js';
import { loadPlugins } from './plugins/loadPlugins.js';

const builtinCommands = [
    MonorepoCommand,
    DepcheckCommand,
    LocaliseCommand,
    IndexCommand,
    QuietRunCommand,
    GitAffectedCommand,
    GitBaseCommand,
    SubmoduleBumpCommand,
];

// `quiet-run` wraps an arbitrary command: it hands that command the environment untouched (the
// command loads its own `.env` if it wants one) and prints nothing beyond its own summary.
// `submodule` and `git` (`git affected`, `git base`) need no `.env`, and their stdout is a contract callers
// parse — so nothing else may be printed there (loading a `.env` logs a line to stdout).
// `secrets`, a plugin's command, decides for itself which values it reads: nzyme adds no `.env`
// loading on top of Bun's.
// `pen`, a plugin's command, runs as git's merge driver: it needs no `.env` and prints nothing extra.
if (!['quiet-run', 'submodule', 'git', 'secrets', 'pen'].includes(process.argv[2] ?? '')) {
    loadEnvVariables();
}

// Initialize the CLI environment
initialize();

const pluginCommands = await loadPlugins();

// Execute the CLI program
await execute({
    name: 'nzyme',
    commands: [...builtinCommands, ...pluginCommands],
});
