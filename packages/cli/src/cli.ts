#!/usr/bin/env -S bun --enable-source-maps --conditions=source

import { loadEnvVariables } from '@nzyme/project-utils/loadEnvVariables.js';

import { DepcheckCommand } from './commands/DepcheckCommand.js';
import { FormatMarkdownCommand } from './commands/FormatMarkdownCommand.js';
import { IndexCommand } from './commands/IndexCommand.js';
import { LocaliseCommand } from './commands/LocaliseCommand.js';
import { MonorepoCommand } from './commands/MonorepoCommand.js';
import { QuietRunCommand } from './commands/QuietRunCommand.js';
import { SubmoduleBumpCommand } from './commands/SubmoduleBumpCommand.js';
import { SubmoduleMirrorCommand } from './commands/SubmoduleMirrorCommand.js';
import { execute } from './execute.js';
import { initialize } from './initialize.js';

// `quiet-run` wraps an arbitrary command: it hands that command the environment untouched (the
// command loads its own `.env` if it wants one) and prints nothing beyond its own summary.
// `submodule` needs no `.env`, and its stdout is a contract workflows parse — so nothing else may
// be printed there (loading a `.env` logs a line to stdout).
if (process.argv[2] !== 'quiet-run' && process.argv[2] !== 'submodule') {
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
        FormatMarkdownCommand,
        IndexCommand,
        QuietRunCommand,
        SubmoduleMirrorCommand,
        SubmoduleBumpCommand,
    ],
});
