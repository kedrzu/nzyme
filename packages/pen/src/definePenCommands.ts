import type { CommandClass } from '@nzyme/cli-core/Command.js';

import { PenCheckCommand } from './commands/PenCheckCommand.js';
import { PenDiffCommand } from './commands/PenDiffCommand.js';
import { PenMergeCommand } from './commands/PenMergeCommand.js';
import { PenRenderCommand } from './commands/PenRenderCommand.js';

/**
 * The `pen` commands. A product CLI spreads them into `execute({ commands })`.
 * @__NO_SIDE_EFFECTS__
 */
export function definePenCommands(): CommandClass[] {
    return [PenCheckCommand, PenMergeCommand, PenDiffCommand, PenRenderCommand];
}
