import path from 'node:path';

import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { readEnvVariables } from '@nzyme/project-utils/readEnvVariables.js';

import { getSecretStores } from '../utils/getSecretStores.js';
import type { SecretStoreEntry } from '../SecretStore.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';
import { selectSecretStore } from './utils/selectSecretStore.js';

/**
 * Defines `secrets import`: moves the variables of a `.env` file into a store.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsImportCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsImportCommand extends Command {
        static override paths = [['secrets', 'import']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'Write the variables of a .env file to a store',
            details: `
                Writes every non-empty variable of the file (write access), under its own name,
                to the store chosen with \`--store\` (optional with one store). Empty variables and
                store credentials are skipped. Prints the mapping lines to paste into the project's
                secrets provider. The file is left untouched: delete it once the import is verified.
            `,
            examples: [['Import .env into the bw store', 'secrets import --store bw']],
        });

        file = Option.String('--file', '.env', { description: 'The dotenv file to import' });
        store = Option.String('--store', { description: 'Alias of the store to write to' });

        override async run() {
            const mapping = this.container.resolve(options.provider);
            const { alias, store } = selectSecretStore(mapping, this.store);

            const filePath = path.resolve(this.file);
            if (!(await Bun.file(filePath).exists())) {
                throw new UsageError(`${filePath} does not exist; nothing was imported.`);
            }

            const variables = await readEnvVariables({
                cwd: path.dirname(filePath),
                file: path.basename(filePath),
            });

            const credentials = new Set(getSecretStores(mapping).flatMap(item => item.credentialEnv ?? []));
            const entries: SecretStoreEntry[] = [];
            const empty: string[] = [];
            const skippedCredentials: string[] = [];

            for (const [key, value] of Object.entries(variables)) {
                if (credentials.has(key)) {
                    skippedCredentials.push(key);
                } else if (!value) {
                    empty.push(key);
                } else {
                    entries.push({ key, value });
                }
            }

            const out = this.context.stdout;
            if (empty.length > 0) {
                out.write(`Skipped, empty: ${empty.join(', ')}\n`);
            }

            if (skippedCredentials.length > 0) {
                out.write(`Skipped, store credentials: ${skippedCredentials.join(', ')}\n`);
            }

            if (entries.length > 0) {
                await store.write(entries);
                out.write(`Wrote ${entries.length} secrets to store ${store.id}. Add to the secrets mapping:\n\n`);
                for (const { key } of entries) {
                    out.write(`${key}: ${alias}.secret(),\n`);
                }

                out.write('\n');
            } else {
                out.write(`Nothing to import from ${filePath}.\n`);
            }

            out.write(`${filePath} was left untouched; delete it by hand once the secrets are verified.\n`);
        }
    };
}
