#!/usr/bin/env node

import { BuildCommand } from './commands/BuildCommand.js';
import { DepcheckCommand } from './commands/DepcheckCommand.js';
import { LocaliseCommand } from './commands/LocaliseCommand.js';
import { MonorepoCommand } from './commands/MonorepoCommand.js';
import { execute } from './execute.js';
import { initialize } from './initialize.js';

// Initialize the CLI environment
initialize();

// Execute the CLI program
await execute({
    name: 'nzyme',
    commands: [BuildCommand, MonorepoCommand, DepcheckCommand, LocaliseCommand],
});
