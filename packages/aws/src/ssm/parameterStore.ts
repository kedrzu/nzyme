import {
    DescribeParametersCommand,
    GetParametersByPathCommand,
    GetParametersCommand,
    PutParameterCommand,
    SSMClient,
} from '@aws-sdk/client-ssm';

import type { SecretStore, SecretStoreEntry } from '@nzyme/secrets/SecretStore.js';
import { splitIntoChunks } from '@nzyme/utils/array/splitIntoChunks.js';

/**
 * Options of {@link parameterStore}.
 */
export interface ParameterStoreOptions {
    /**
     * What the store covers. Starting with `/` it is a path (`/secrets/dev/`; a trailing `/` is added
     * when missing, so `/secrets/dev` never reaches `/secrets/dev2/`): the store holds the parameters
     * directly under it, and deeper paths are not secrets of this store. Without a leading `/` it is a
     * name prefix (`FOOBAR_`): the store holds the parameters whose name starts with it. Must not be empty.
     */
    prefix: string;
    /** The AWS region; the SDK's default resolution when omitted. */
    region?: string;
    /** The shared-config profile the credentials come from; the SDK's default provider chain when omitted. */
    profile?: string;
    /**
     * The service endpoint (`https://ssm.us-east-1.amazonaws.com`). Omitted, the SDK resolves it, and
     * honours `AWS_ENDPOINT_URL`: a process that points its AWS clients at a local emulator would read
     * the store from the emulator too. Set it when the store must be the real one whatever that variable says.
     */
    endpoint?: string;
    /**
     * An `SSMClient` to use instead of creating one (tests). `region`, `profile` and `endpoint` are then
     * not applied.
     */
    client?: SSMClient;
}

/** `GetParameters` accepts at most this many names per call. */
const GET_PARAMETERS_BATCH_SIZE = 10;

/**
 * An AWS Systems Manager Parameter Store prefix as a secret store. Values are read decrypted and
 * written as `SecureString`, standard tier.
 *
 * Credentials come from the AWS SDK provider chain, or from `profile`. There is no `login`, and no
 * `credentialEnv`: stripping `AWS_*` variables from a child process would break the tools in it that
 * need them.
 * @__NO_SIDE_EFFECTS__
 */
export function parameterStore(options: ParameterStoreOptions): SecretStore {
    const { region, profile, endpoint } = options;
    if (options.prefix === '') {
        throw new Error('Parameter Store prefix must not be empty');
    }

    const isPath = options.prefix.startsWith('/');
    const prefix = isPath && !options.prefix.endsWith('/') ? `${options.prefix}/` : options.prefix;
    const client = options.client ?? new SSMClient({ region, profile, endpoint });

    return {
        // The endpoint is part of the identity: the same prefix behind another endpoint is another store.
        id: `ssm:${region ?? 'default'}${endpoint == null ? '' : `@${endpoint}`}:${prefix}${profile == null ? '' : `:${profile}`}`,
        readAll,
        write,
    };

    async function readAll() {
        const parameters = isPath ? await readPath() : await readNamePrefix();
        const result = new Map<string, string>();
        for (const { name, value } of parameters) {
            // Defence in depth: whatever the service returns, only direct members of the prefix are kept.
            if (!name.startsWith(prefix)) {
                continue;
            }

            const key = name.slice(prefix.length);
            if (key === '' || (isPath && key.includes('/'))) {
                continue;
            }

            result.set(key, value);
        }

        return result;
    }

    async function readPath() {
        const parameters: ParameterValue[] = [];
        let nextToken: string | undefined;
        do {
            const page = await client.send(
                new GetParametersByPathCommand({
                    Path: prefix.slice(0, -1),
                    Recursive: false,
                    WithDecryption: true,
                    NextToken: nextToken,
                }),
            );
            collect(parameters, page.Parameters);
            nextToken = page.NextToken;
        } while (nextToken != null);

        return parameters;
    }

    async function readNamePrefix() {
        const names: string[] = [];
        let nextToken: string | undefined;
        do {
            const page = await client.send(
                new DescribeParametersCommand({
                    ParameterFilters: [{ Key: 'Name', Option: 'BeginsWith', Values: [prefix] }],
                    NextToken: nextToken,
                }),
            );
            for (const { Name } of page.Parameters ?? []) {
                if (Name != null) {
                    names.push(Name);
                }
            }

            nextToken = page.NextToken;
        } while (nextToken != null);

        const parameters: ParameterValue[] = [];
        for (const batch of splitIntoChunks(names, GET_PARAMETERS_BATCH_SIZE)) {
            const page = await client.send(new GetParametersCommand({ Names: batch, WithDecryption: true }));
            collect(parameters, page.Parameters);
        }

        return parameters;
    }

    async function write(entries: SecretStoreEntry[]) {
        for (const { key, value } of entries) {
            await client.send(
                new PutParameterCommand({
                    Name: prefix + key,
                    Value: value,
                    Type: 'SecureString',
                    Overwrite: true,
                    Tier: 'Standard',
                }),
            );
        }
    }
}

interface ParameterValue {
    name: string;
    value: string;
}

function collect(target: ParameterValue[], parameters: { Name?: string; Value?: string }[] | undefined) {
    for (const { Name, Value } of parameters ?? []) {
        if (Name != null && Value != null) {
            target.push({ name: Name, value: Value });
        }
    }
}
