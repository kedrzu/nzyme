import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import { getSecretKey } from '../utils/getSecretKey.js';
import { resolveSecrets } from '../utils/resolveSecrets.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets list`: each mapped name, where it comes from and whether it resolves — never a value.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsListCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsListCommand extends Command {
        static override paths = [['secrets', 'list']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'List the mapped secrets and whether each resolves',
            details: `
                Prints each mapped name with its store and key and a status: \`resolves\`,
                \`missing\`, or \`overridden by environment\`. Values are never printed. Exits
                non-zero when any secret is missing.
            `,
        });

        override async run() {
            const mapping = this.container.resolve(options.provider);
            const env = this.container.resolve(EnvVariables);
            const { missing, overridden } = await resolveSecrets(mapping, env);
            const missingNames = new Set(missing.map(secret => secret.name));
            const overriddenNames = new Set(overridden);

            for (const [name, ref] of Object.entries(mapping.secrets)) {
                let status = 'resolves';
                if (overriddenNames.has(name)) {
                    status = 'overridden by environment';
                } else if (missingNames.has(name)) {
                    status = 'missing';
                }

                this.context.stdout.write(`${name}  ${ref.store.id}:${getSecretKey(name, ref)}  ${status}\n`);
            }

            return missing.length > 0 ? 1 : 0;
        }
    };
}
