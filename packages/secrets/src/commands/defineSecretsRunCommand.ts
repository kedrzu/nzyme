import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { spawnForExitCode } from '@nzyme/cli-core/utils/spawnForExitCode.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import { mergeStores, readStores } from '../utils/readStores.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets run <KEY>... -- <command>`: runs a command with the named secrets in its environment.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecretsRunCommand(options: SecretsCommandsOptions): CommandClass {
    return class SecretsRunCommand extends Command {
        static override paths = [['secrets', 'run']];
        static override usage = Command.Usage({
            category: 'Secrets',
            description: 'Run a command with the named secrets in its environment',
            details: `
                Reads every store (it never writes) and runs the command with the named secrets as
                environment variables — never as arguments — and no other secret. For a key in several
                stores the earlier store wins; a variable already set wins over its secret. The stores'
                credentials are removed from the command's environment. Nothing is started when a store
                cannot be read or a named secret is in no store. The exit code is the command's own,
                \`128 + signal\` when a signal killed it. This command reports on stderr only, so the
                command's stdout is its own.
            `,
            examples: [['Start the dev server with its API key', 'secrets run API_KEY -- bun run dev']],
        });

        // One proxy takes both lists: clipanion allows a single variadic per command, and the proxy
        // keeps the `--` that separates the keys from the command.
        args = Option.Proxy({ name: 'KEY... -- command', required: 1 });

        override async run() {
            const separator = this.args.indexOf('--');
            const keys = separator === -1 ? [] : this.args.slice(0, separator);
            const [executable, ...args] = separator === -1 ? [] : this.args.slice(separator + 1);
            if (keys.length === 0 || executable === undefined) {
                throw new UsageError('Name the secrets and the command: secrets run <KEY>... -- <command>');
            }

            const { stores } = this.container.resolve(options.provider);
            const env = this.container.resolve(EnvVariables);
            const merged = mergeStores(await readStores(stores));

            const childEnv: EnvVariables = { ...env };
            for (const store of stores) {
                for (const name of store.credentialEnv ?? []) {
                    delete childEnv[name];
                }
            }

            const overridden: string[] = [];
            const missing: string[] = [];
            for (const key of keys) {
                const value = merged.get(key);
                if (env[key]) {
                    overridden.push(key);
                } else if (value === undefined) {
                    missing.push(key);
                } else {
                    childEnv[key] = value;
                }
            }

            if (missing.length > 0) {
                this.context.stderr.write(`Not in any store, nothing started: ${missing.join(', ')}\n`);
                return 1;
            }

            if (overridden.length > 0) {
                this.context.stderr.write(`Set in the environment, not read: ${overridden.join(', ')}\n`);
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
