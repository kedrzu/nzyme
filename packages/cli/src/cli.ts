#!/usr/bin/env node

import { BuildCommand } from './commands/BuildCommand.js';
import { DepcheckCommand } from './commands/DepcheckCommand.js';
import { MonorepoCommand } from './commands/MonorepoCommand.js';
import { defineProgram } from './defineProgram.js';
import { initialize } from './initialize.js';

/**
 * Initialize the CLI environment
 */
initialize();

/**
 * Create and configure the CLI program with available commands
 */
const program = defineProgram({
    name: 'nzyme',
    commands: [BuildCommand, MonorepoCommand, DepcheckCommand],
});

/**
 * Run the CLI program and exit with the result code
 */
await program.runAndExit();
