import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { spawnForExitCode } from '@nzyme/cli-core/utils/spawnForExitCode.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import { describeMissingSecrets, resolveSecrets } from '../utils/resolveSecrets.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets run -- <command>`: runs a command with every mapped secret in its environment.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsRunCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsRunCommand extends Command {
        static override paths = [['secrets', 'run']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'Run a command with the mapped secrets in its environment',
            details: `
                Reads every mapped secret (it never writes) and runs the command with them as
                environment variables — never as arguments. A variable already set wins over its
                secret. The store's credentials are removed from the command's environment.
                Nothing is started when a secret is missing. The exit code is the command's own,
                \`128 + signal\` when a signal killed it. This command reports on stderr only, so the
                command's stdout is its own.
            `,
            examples: [['Start the dev server with secrets', 'secrets run -- bun run dev']],
        });

        command = Option.Proxy({ name: 'command', required: 1 });

        override async run() {
            const mapping = this.container.resolve(options.provider);
            const env = this.container.resolve(EnvVariables);
            const { values, missing, overridden } = await resolveSecrets(mapping, env);

            if (missing.length > 0) {
                throw new UsageError(
                    `Secrets missing or empty, nothing was started: ${describeMissingSecrets(missing)}`,
                );
            }

            if (overridden.length > 0) {
                this.context.stderr.write(`Set in the environment, not read: ${overridden.join(', ')}\n`);
            }

            const childEnv: EnvVariables = { ...env };
            for (const name of mapping.store.credentialEnv ?? []) {
                delete childEnv[name];
            }

            for (const [name, value] of values) {
                childEnv[name] = value;
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
