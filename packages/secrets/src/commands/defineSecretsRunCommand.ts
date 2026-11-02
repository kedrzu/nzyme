import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import type { Writable } from 'node:stream';

import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import { getSecretStores } from '../getSecretStores.js';
import { resolveSecrets } from '../resolveSecrets.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/** Exit code a shell uses for a command it cannot find — reused when the command cannot be spawned. */
const COMMAND_NOT_FOUND = 127;

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
                Reads every mapped secret (read access only) and runs the command with them as
                environment variables — never as arguments. A variable already set wins over its
                secret. The credentials of every store are removed from the command's environment.
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
                const list = missing.map(secret => `${secret.name} (key ${secret.key} in store ${secret.storeId})`);
                throw new UsageError(`Secrets missing or empty, nothing was started: ${list.join(', ')}`);
            }

            if (overridden.length > 0) {
                this.context.stderr.write(`Set in the environment, not read: ${overridden.join(', ')}\n`);
            }

            const childEnv: EnvVariables = { ...env };
            for (const store of getSecretStores(mapping)) {
                for (const name of store.credentialEnv ?? []) {
                    delete childEnv[name];
                }
            }

            for (const [name, value] of values) {
                childEnv[name] = value;
            }

            const [executable, ...args] = this.command;
            if (executable === undefined) {
                throw new UsageError('No command to run.');
            }

            return await runInherited(executable, args, childEnv, this.context.stderr);
        }
    };
}

/** Runs a command on this process's terminal, resolving with its exit code. */
function runInherited(executable: string, args: string[], env: EnvVariables, stderr: Writable) {
    return new Promise<number>(resolve => {
        const child = spawn(executable, args, { stdio: 'inherit', env });
        child.on('error', error => {
            stderr.write(`Could not start ${executable}: ${error.message}\n`);
            resolve(COMMAND_NOT_FOUND);
        });
        child.on('close', (code, signal) => {
            resolve(code ?? 128 + (signal ? constants.signals[signal] : 0));
        });
    });
}
