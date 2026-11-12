/**
 * A CLI with the plugin's commands, run as a real process by the command tests so that the exit
 * code and the output are observed as a repo's `lint` sees them.
 */
import { execute } from '@nzyme/cli-core/execute.js';

import plugin from '../../plugin.js';

await execute({ name: 'fixture', commands: plugin.commands });
