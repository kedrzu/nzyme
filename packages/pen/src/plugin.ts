import type { NzymePlugin } from '@nzyme/cli-core/NzymePlugin.js';

import { PenCheckCommand } from './commands/PenCheckCommand.js';
import { PenDiffCommand } from './commands/PenDiffCommand.js';
import { PenMergeCommand } from './commands/PenMergeCommand.js';
import { PenRenderCommand } from './commands/PenRenderCommand.js';

/** The `pen` commands, for a repo to list under `nzyme.plugins` (through a file re-exporting this). */
export default { commands: [PenCheckCommand, PenMergeCommand, PenDiffCommand, PenRenderCommand] } satisfies NzymePlugin;
