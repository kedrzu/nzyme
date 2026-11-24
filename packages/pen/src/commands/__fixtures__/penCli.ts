/**
 * A CLI with the `pen` commands, run as a real process by the command tests so that the exit
 * code and the output are observed as a repo's `lint` sees them.
 */
import { execute } from '@nzyme/cli-core/execute.js';

import { definePenCommands } from '../../definePenCommands.js';

await execute({ name: 'fixture', commands: definePenCommands() });
