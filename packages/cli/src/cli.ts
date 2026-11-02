#!/usr/bin/env -S bun --enable-source-maps --conditions=source

import { execute } from '@nzyme/cli-core/execute.js';
import { initialize } from '@nzyme/cli-core/initialize.js';
import { loadEnvVariables } from '@nzyme/project-utils/loadEnvVariables.js';

import { DepcheckCommand } from './commands/DepcheckCommand.js';
import { FormatMarkdownCommand } from './commands/FormatMarkdownCommand.js';
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
    FormatMarkdownCommand,
    IndexCommand,
    QuietRunCommand,
    SubmoduleBumpCommand,
];

// `quiet-run` wraps an arbitrary command: it hands that command the environment untouched (the
// command loads its own `.env` if it wants one) and prints nothing beyond its own summary.
// `submodule` needs no `.env`, and its stdout is a contract workflows parse — so nothing else may
// be printed there (loading a `.env` logs a line to stdout).
// `secrets`, a plugin's command, decides for itself which values it reads: nzyme adds no `.env`
// loading on top of Bun's.
if (process.argv[2] !== 'quiet-run' && process.argv[2] !== 'submodule' && process.argv[2] !== 'secrets') {
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
