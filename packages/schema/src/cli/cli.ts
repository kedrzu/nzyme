#!/usr/bin/env bun --enable-source-maps

import { execute } from '@nzyme/cli/execute.js';
import { initialize } from '@nzyme/cli/initialize.js';
import { loadEnvVariables } from '@nzyme/project-utils/loadEnvVariables.js';

import { WatchCommand } from './commands/WatchCommand.js';
import { ZchemaCommand } from './commands/ZchemaCommand.js';

loadEnvVariables();

// Initialize the CLI environment
initialize();

// Execute the CLI program
await execute({
    name: 'zchema',
    title: 'Schema Generator CLI',
    commands: [ZchemaCommand, WatchCommand],
});
