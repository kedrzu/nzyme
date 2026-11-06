#!/usr/bin/env -S bun --enable-source-maps --conditions=source

import { execute } from '@nzyme/cli-core/execute.js';
import { initialize } from '@nzyme/cli-core/initialize.js';
import { loadEnvVariables } from '@nzyme/project-utils/loadEnvVariables.js';

import { DepcheckCommand } from './commands/DepcheckCommand.js';
import { IndexCommand } from './commands/IndexCommand.js';
import { LocaliseCommand } from './commands/LocaliseCommand.js';
import { MachineReserveCommand } from './commands/MachineReserveCommand.js';
import { MachineStatusCommand } from './commands/MachineStatusCommand.js';
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
    SubmoduleBumpCommand,
    MachineReserveCommand,
    MachineStatusCommand,
];

// `quiet-run` wraps an arbitrary command: it hands that command the environment untouched (the
// command loads its own `.env` if it wants one) and prints nothing beyond its own summary.
// `submodule` needs no `.env`, and its stdout is a contract workflows parse — so nothing else may
// be printed there (loading a `.env` logs a line to stdout). The same holds for `machine`: a shell
// captures the worker count `machine reserve` prints, and `machine status --json` is parsed.
// `secrets`, a plugin's command, decides for itself which values it reads: nzyme adds no `.env`
// loading on top of Bun's.
const commandsWithoutEnv = new Set(['quiet-run', 'submodule', 'machine', 'secrets']);
if (!commandsWithoutEnv.has(process.argv[2] ?? '')) {
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
