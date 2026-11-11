import type { NzymePlugin } from '@nzyme/cli-core/NzymePlugin.js';

import { PenCheckCommand } from './commands/PenCheckCommand.js';
import { PenMergeCommand } from './commands/PenMergeCommand.js';

/** The `pen` commands, for a repo to list under `nzyme.plugins` (through a file re-exporting this). */
export default { commands: [PenCheckCommand, PenMergeCommand] } satisfies NzymePlugin;
