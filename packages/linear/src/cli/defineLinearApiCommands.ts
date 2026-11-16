import type { CommandClass } from '@nzyme/cli-core/Command.js';

import { defineLinearQueryCommand } from './LinearQueryCommand.js';
import { defineLinearSchemaCommand } from './LinearSchemaCommand.js';
import type { LinearCommandsOptions } from './defineLinearCommands.js';

/**
 * Options for the Linear API commands: the same `linear` config and `prefix` as
 * {@link LinearCommandsOptions}, nothing else.
 */
export type LinearApiCommandsOptions = Pick<LinearCommandsOptions, 'linear' | 'prefix'>;

/**
 * Defines the commands that give an agent direct, token-cheap access to the Linear GraphQL API:
 * `query` runs a document, `schema` shows the committed schema one type at a time. Registered under
 * `prefix`, e.g. `linear query` and `linear schema`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLinearApiCommands(options: LinearApiCommandsOptions): CommandClass[] {
    return [defineLinearQueryCommand(options), defineLinearSchemaCommand(options)];
}
