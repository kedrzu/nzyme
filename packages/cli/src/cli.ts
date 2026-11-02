#!/usr/bin/env -S bun --enable-source-maps --conditions=source

import { loadEnvVariables } from '@nzyme/project-utils/loadEnvVariables.js';

import { DepcheckCommand } from './commands/DepcheckCommand.js';
import { IndexCommand } from './commands/IndexCommand.js';
import { LocaliseCommand } from './commands/LocaliseCommand.js';
import { MachineReserveCommand } from './commands/MachineReserveCommand.js';
import { MachineStatusCommand } from './commands/MachineStatusCommand.js';
import { MonorepoCommand } from './commands/MonorepoCommand.js';
import { QuietRunCommand } from './commands/QuietRunCommand.js';
import { SubmoduleBumpCommand } from './commands/SubmoduleBumpCommand.js';
import { execute } from './execute.js';
import { initialize } from './initialize.js';

// `quiet-run` wraps an arbitrary command: it hands that command the environment untouched (the
// command loads its own `.env` if it wants one) and prints nothing beyond its own summary.
// `submodule` needs no `.env`, and its stdout is a contract workflows parse — so nothing else may
// be printed there (loading a `.env` logs a line to stdout). The same holds for `machine`: a shell
// captures the worker count `machine reserve` prints, and `machine status --json` is parsed.
const commandsWithoutEnv = new Set(['quiet-run', 'submodule', 'machine']);
if (!commandsWithoutEnv.has(process.argv[2] ?? '')) {
    loadEnvVariables();
}

// Initialize the CLI environment
initialize();

// Execute the CLI program
await execute({
    name: 'nzyme',
    commands: [
        MonorepoCommand,
        DepcheckCommand,
        LocaliseCommand,
        IndexCommand,
        QuietRunCommand,
        SubmoduleBumpCommand,
        MachineReserveCommand,
        MachineStatusCommand,
    ],
});
