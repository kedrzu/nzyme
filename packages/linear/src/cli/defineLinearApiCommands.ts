import type { CommandClass } from '@nzyme/cli-core/Command.js';
import type { Injectable } from '@nzyme/ioc/Injectable.js';

import type { LinearAuthShape } from '../auth/defineLinearAuth.js';
import { defineLinearAuthCommand } from '../auth/defineLinearAuthCommand.js';
import { defineLinearQueryCommand } from './LinearQueryCommand.js';
import { defineLinearSchemaCommand } from './LinearSchemaCommand.js';
import type { LinearCommandsOptions } from './defineLinearCommands.js';

/**
 * Options for the Linear API commands. The credential is either a personal API key (`linear`, the
 * same config and `prefix` as {@link LinearCommandsOptions}) or the person's OAuth sign-in (`auth`,
 * the unit from `defineLinearAuth`, which also adds the `auth` command that signs in).
 */
export type LinearApiCommandsOptions =
    | Pick<LinearCommandsOptions, 'linear' | 'prefix'>
    | {
          prefix?: string;
          auth: Injectable<LinearAuthShape>;
      };

/**
 * Defines the commands that give an agent direct, token-cheap access to the Linear GraphQL API:
 * `query` runs a document, `schema` shows the committed schema one type at a time, and with `auth`
 * (the OAuth sign-in rather than a personal key) `auth` signs the person in. Registered under
 * `prefix`, e.g. `linear query` and `linear schema`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLinearApiCommands(options: LinearApiCommandsOptions): CommandClass[] {
    const commands = [defineLinearQueryCommand(options), defineLinearSchemaCommand(options)];
    if ('auth' in options) {
        commands.push(defineLinearAuthCommand({ prefix: options.prefix, auth: options.auth }));
    }
    return commands;
}
