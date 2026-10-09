#!/usr/bin/env -S bun --enable-source-maps --conditions=source

import { loadEnvVariables } from '@nzyme/project-utils/loadEnvVariables.js';

import { DepcheckCommand } from './commands/DepcheckCommand.js';
import { FormatMarkdownCommand } from './commands/FormatMarkdownCommand.js';
import { IndexCommand } from './commands/IndexCommand.js';
import { LocaliseCommand } from './commands/LocaliseCommand.js';
import { MonorepoCommand } from './commands/MonorepoCommand.js';
import { QuietRunCommand } from './commands/QuietRunCommand.js';
import { execute } from './execute.js';
import { initialize } from './initialize.js';

// `quiet-run` wraps an arbitrary command: it hands that command the environment untouched (the
// command loads its own `.env` if it wants one) and prints nothing beyond its own summary.
if (process.argv[2] !== 'quiet-run') {
    loadEnvVariables();
}

// Initialize the CLI environment
initialize();

// Execute the CLI program
await execute({
    name: 'nzyme',
    commands: [MonorepoCommand, DepcheckCommand, LocaliseCommand, FormatMarkdownCommand, IndexCommand, QuietRunCommand],
});
