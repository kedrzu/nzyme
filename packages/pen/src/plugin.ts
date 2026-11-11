import type { NzymePlugin } from '@nzyme/cli-core/NzymePlugin.js';

import { PenCheckCommand } from './commands/PenCheckCommand.js';

/** The `pen` commands, for a repo to list under `nzyme.plugins` (through a file re-exporting this). */
export default { commands: [PenCheckCommand] } satisfies NzymePlugin;
