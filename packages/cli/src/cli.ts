#!/usr/bin/env node

import { consola } from 'consola';
import sourceMap from 'source-map-support';

import { patchNodeWarnings } from '@nzyme/node-utils';
import { defineProgram } from './defineProgram.js';
import { BuildCommand } from './commands/BuildCommand.js';
import { MonorepoCommand } from './commands/MonorepoCommand.js';
import { DepcheckCommand } from './commands/DepcheckCommand.js';

consola.wrapAll();
sourceMap.install();
patchNodeWarnings();

const program = defineProgram({
    name: 'nzyme',
    commands: [BuildCommand, MonorepoCommand, DepcheckCommand],
});

await program.runAndExit();
