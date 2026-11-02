import type { CommandClass } from '@nzyme/cli-core/Command.js';

import { defineSecretsImportCommand } from './defineSecretsImportCommand.js';
import { defineSecretsListCommand } from './defineSecretsListCommand.js';
import { defineSecretsLoginCommand } from './defineSecretsLoginCommand.js';
import { defineSecretsRefreshCommand } from './defineSecretsRefreshCommand.js';
import { defineSecretsRunCommand } from './defineSecretsRunCommand.js';
import { defineSecretsSetCommand } from './defineSecretsSetCommand.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines the `secrets` commands for a project's secrets provider. Export them from a plugin module
 * (`export default { commands: defineSecretsCommands({ provider }) } satisfies NzymePlugin`) or
 * spread them into a product CLI's `execute({ commands })`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsCommands(options: SecretsCommandsOptions): CommandClass[] {
    return [
        defineSecretsLoginCommand(options),
        defineSecretsSetCommand(options),
        defineSecretsListCommand(options),
        defineSecretsImportCommand(options),
        defineSecretsRunCommand(options),
        defineSecretsRefreshCommand(options),
    ];
}
