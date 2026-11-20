import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { spawnForExitCode } from '@nzyme/cli-core/utils/spawnForExitCode.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import { mergeStores, readStores } from '../utils/readStores.js';
import type { SecretDeclarations } from './utils/getSecretDeclarations.js';
import { getSecretDeclarations, getUndeclaredReason } from './utils/getSecretDeclarations.js';
import type { SecretsCommandsOptions } from './SecretsCommandsOptions.js';

/**
 * Defines `secrets run [KEY]... -- <command>`: runs a command with the named secrets, or every
 * declared one, in its environment.
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

                When the project declares its secrets, each named key must be declared with
                \`defineSecret\` and enabled in this environment, and with no key named the command
                gets every enabled declared secret. Otherwise at least one key must be named.
            `,
            examples: [
                ['Start the dev server with its API key', 'secrets run API_KEY -- bun run dev'],
                ['Start the dev server with every declared secret', 'secrets run -- bun run dev'],
            ],
        });

        // One proxy takes both lists: clipanion allows a single variadic per command, and the proxy
        // keeps the `--` that separates the keys from the command. Not `required`: a required proxy
        // lets clipanion swallow a leading `--`, so keyless `run -- cmd` would read as `run cmd`.
        // That also leaves `-h` to this command.
        args = Option.Proxy({ name: 'KEY... -- command' });

        override async run() {
            if (this.args[0] === '-h' || this.args[0] === '--help') {
                this.context.stdout.write(this.cli.usage(SecretsRunCommand, { detailed: true }));
                return 0;
            }

            const separator = this.args.indexOf('--');
            const named = separator === -1 ? [] : this.args.slice(0, separator);
            const [executable, ...args] = separator === -1 ? [] : this.args.slice(separator + 1);
            const { stores, secrets } = this.container.resolve(options.provider);
            if ((named.length === 0 && !secrets) || executable === undefined) {
                throw new UsageError('Name the secrets and the command: secrets run <KEY>... -- <command>');
            }

            const env = this.container.resolve(EnvVariables);
            const keys = secrets ? getDeclaredKeys(getSecretDeclarations(secrets, env), named) : named;
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

/** The named keys, each declared and enabled, or every enabled declared key when none is named. */
function getDeclaredKeys(declarations: SecretDeclarations, named: string[]): string[] {
    if (named.length === 0) {
        return declarations.enabled;
    }

    for (const key of named) {
        const reason = getUndeclaredReason(declarations, key);
        if (reason) {
            throw new UsageError(`Refusing to run with ${key}: ${reason}.`);
        }
    }

    return named;
}
