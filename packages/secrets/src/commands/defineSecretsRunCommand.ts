import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { spawnForExitCode } from '@nzyme/cli-core/utils/spawnForExitCode.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import { mergeStores, readStores } from '../utils/readStores.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets run -- <command>`: runs a command with the secrets of every store in its environment.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsRunCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsRunCommand extends Command {
        static override paths = [['secrets', 'run']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'Run a command with the secrets of every store in its environment',
            details: `
                Reads every store (it never writes) and runs the command with their secrets as
                environment variables — never as arguments. For a key in several stores the earlier
                store wins; a variable already set wins over its secret. The stores' credentials are
                removed from the command's environment. Nothing is started when a store cannot be
                read. The exit code is the command's own,
                \`128 + signal\` when a signal killed it. This command reports on stderr only, so the
                command's stdout is its own.
            `,
            examples: [['Start the dev server with secrets', 'secrets run -- bun run dev']],
        });

        command = Option.Proxy({ name: 'command', required: 1 });

        override async run() {
            const { stores } = this.container.resolve(options.provider);
            const env = this.container.resolve(EnvVariables);
            const merged = mergeStores(await readStores(stores));

            const overridden: string[] = [];
            const childEnv: EnvVariables = { ...env };
            for (const store of stores) {
                for (const name of store.credentialEnv ?? []) {
                    delete childEnv[name];
                }
            }

            for (const [name, value] of merged) {
                if (env[name]) {
                    overridden.push(name);
                } else {
                    childEnv[name] = value;
                }
            }

            if (overridden.length > 0) {
                this.context.stderr.write(`Set in the environment, not read: ${overridden.join(', ')}\n`);
            }

            const [executable, ...args] = this.command;
            if (executable === undefined) {
                throw new UsageError('No command to run.');
            }

            const { exitCode, error } = await spawnForExitCode({
                executable,
                args,
                stdio: 'inherit',
                env: childEnv,
            });

            if (error) {
                this.context.stderr.write(`Could not start ${executable}: ${error.message}\n`);
            }

            return exitCode;
        }
    };
}
