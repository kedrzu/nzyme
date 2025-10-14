#!/usr/bin/env node --enable-source-maps

import { execute, initialize } from '@nzyme/cli';
import { loadEnvVariables } from '@nzyme/project-utils';

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
