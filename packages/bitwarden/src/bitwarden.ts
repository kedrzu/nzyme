import type { SecretStore, SecretStoreEntry, SecretStoreLoginContext } from '@nzyme/secrets/SecretStore.js';
import { defineSecretStore } from '@nzyme/secrets/SecretStore.js';
import type { Keychain } from '@nzyme/secrets/osKeychain.js';
import { osKeychain } from '@nzyme/secrets/osKeychain.js';

import type { BitwardenSecret, BitwardenSecretCreateRequest, BitwardenSecretUpdateRequest } from './bitwardenApi.js';
import type { BitwardenClient, BitwardenServerUrls } from './BitwardenClient.js';
import { loginBitwarden } from './BitwardenClient.js';
import { decryptEncString, encryptEncString } from './bitwardenCrypto.js';

/**
 * Options of {@link bitwarden}.
 */
export interface BitwardenOptions {
    /** The Secrets Manager project id. The store reads and writes only this project's secrets. */
    project: string;
    /**
     * The Bitwarden server: a cloud vault URL (`https://vault.bitwarden.com`, `https://vault.bitwarden.eu`)
     * or the base URL of a self-hosted server, which serves `/identity` and `/api`.
     * Defaults to Bitwarden Cloud US.
     */
    server?: string;
    /** Where `login` keeps access tokens; the OS keychain by default. */
    keychain?: Keychain;
    /** Where `BWS_ACCESS_TOKEN` is read from; `process.env` by default. */
    env?: Record<string, string | undefined>;
}

const ACCESS_TOKEN_ENV = 'BWS_ACCESS_TOKEN';
const DEFAULT_SERVER = 'https://vault.bitwarden.com';
const CLOUD_VAULT_HOSTS = new Set(['vault.bitwarden.com', 'vault.bitwarden.eu']);

/** The server's limits on EncString lengths (`EncryptedStringLength` on its request models). */
const MAX_ENCRYPTED_KEY_LENGTH = 1000;
const MAX_ENCRYPTED_VALUE_LENGTH = 35000;

/**
 * A Bitwarden Secrets Manager project as a secret store. A read costs at most three requests (login,
 * project listing, one fetch of the wanted secrets), however many keys are read.
 *
 * Credentials: `BWS_ACCESS_TOKEN` when set, for both reading and writing; otherwise the token
 * `secrets login` stored for this server, a separate one for read and for write access.
 * @__NO_SIDE_EFFECTS__
 */
export function bitwarden(options: BitwardenOptions): SecretStore {
    const { project, keychain = osKeychain, env = process.env } = options;
    const server = (options.server ?? DEFAULT_SERVER).replace(/\/+$/, '');
    const serverUrl = new URL(server);
    const host = serverUrl.host + serverUrl.pathname.replace(/\/+$/, '');
    const urls = getServerUrls(server, serverUrl);

    return defineSecretStore({
        id: `bitwarden:${host}:${project}`,
        credentialEnv: [ACCESS_TOKEN_ENV],
        read,
        write,
        login,
    });

    async function read(keys: string[]) {
        const client = await connect('read');
        const idsByKey = await listProject(client);
        const wanted = new Map<string, string>();
        for (const key of keys) {
            const id = findSecretId(idsByKey, key);
            if (id != null) {
                wanted.set(id, key);
            }
        }

        const result = new Map<string, string>();
        if (wanted.size === 0) {
            return result;
        }

        for (const secret of await client.getSecrets([...wanted.keys()])) {
            const key = wanted.get(secret.id);
            if (key == null) {
                throw new Error('Bitwarden returned a secret that was not asked for');
            }

            if (secret.value == null) {
                throw new Error(`Bitwarden secret ${key} has no value: store one with \`secrets set\``);
            }

            result.set(key, await decryptEncString(secret.value, client.organizationKey));
        }

        return result;
    }

    async function write(entries: SecretStoreEntry[]) {
        const client = await connect('write');
        const idsByKey = await listProject(client);
        const updates: SecretStoreUpdate[] = [];
        const creates: SecretStoreEntry[] = [];
        for (const entry of entries) {
            const id = findSecretId(idsByKey, entry.key);
            if (id == null) {
                creates.push(entry);
            } else {
                updates.push({ ...entry, id });
            }
        }

        // Fetched only to re-send the note: an update must carry one, and it is kept as it was.
        const existing = new Map<string, BitwardenSecret>();
        if (updates.length > 0) {
            for (const secret of await client.getSecrets(updates.map(update => update.id))) {
                existing.set(secret.id, secret);
            }
        }

        // Everything is encrypted and checked before the first write, so a too-long value writes nothing.
        const emptyNote = await encryptEncString('', client.organizationKey);
        const sends: (() => Promise<void>)[] = [];
        for (const update of updates) {
            const note = existing.get(update.id)?.note;
            const request: BitwardenSecretUpdateRequest = {
                ...(await encryptEntry(update, client)),
                note: note != null && note !== '' ? note : emptyNote,
                projectIds: [project],
                valueChanged: true,
            };
            sends.push(() => client.updateSecret(update.id, request));
        }

        for (const create of creates) {
            const request: BitwardenSecretCreateRequest = {
                ...(await encryptEntry(create, client)),
                note: emptyNote,
                projectIds: [project],
            };
            sends.push(() => client.createSecret(request));
        }

        for (const sendRequest of sends) {
            await sendRequest();
        }
    }

    async function login({ access, prompt }: SecretStoreLoginContext) {
        const token = (await prompt(`Bitwarden access token with ${access} access to ${host}`)).trim();
        // Proves the token works against this server before it is stored for it.
        await loginBitwarden(urls, token);
        await keychain.set(keychainName(access), token);
    }

    async function connect(access: 'read' | 'write') {
        const fromEnv = env[ACCESS_TOKEN_ENV];
        if (fromEnv != null && fromEnv !== '') {
            return await loginBitwarden(urls, fromEnv);
        }

        const stored = await keychain.get(keychainName(access));
        if (stored == null) {
            const command = access === 'write' ? 'secrets login --write' : 'secrets login';
            throw new Error(`No Bitwarden ${access} token for ${host}: run \`${command}\` or set ${ACCESS_TOKEN_ENV}`);
        }

        return await loginBitwarden(urls, stored);
    }

    function keychainName(access: 'read' | 'write') {
        return `bitwarden:${host}:${access}`;
    }

    /** Decrypts the project's keys into key → ids; more than one id means a duplicate key. */
    async function listProject(client: BitwardenClient) {
        const idsByKey = new Map<string, string[]>();
        for (const secret of await client.listProjectSecrets(project)) {
            if (secret.key == null) {
                throw new Error(`Bitwarden secret ${secret.id} has no key`);
            }

            const key = await decryptEncString(secret.key, client.organizationKey);
            const ids = idsByKey.get(key);
            if (ids == null) {
                idsByKey.set(key, [secret.id]);
            } else {
                ids.push(secret.id);
            }
        }

        return idsByKey;
    }

    function findSecretId(idsByKey: Map<string, string[]>, key: string) {
        const ids = idsByKey.get(key);
        if (ids != null && ids.length > 1) {
            throw new Error(
                `Bitwarden project ${project} has ${ids.length} secrets named ${key}: delete or rename all but one`,
            );
        }

        return ids?.[0];
    }
}

interface SecretStoreUpdate extends SecretStoreEntry {
    id: string;
}

function getServerUrls(server: string, serverUrl: URL): BitwardenServerUrls {
    if (CLOUD_VAULT_HOSTS.has(serverUrl.host)) {
        const domain = serverUrl.host.replace(/^vault\./, '');
        return { identity: `https://identity.${domain}`, api: `https://api.${domain}` };
    }

    return { identity: `${server}/identity`, api: `${server}/api` };
}

async function encryptEntry(entry: SecretStoreEntry, client: BitwardenClient) {
    const key = await encryptEncString(entry.key, client.organizationKey);
    const value = await encryptEncString(entry.value, client.organizationKey);
    if (key.length > MAX_ENCRYPTED_KEY_LENGTH) {
        throw new Error(`Secret key ${entry.key} is too long for Bitwarden`);
    }

    if (value.length > MAX_ENCRYPTED_VALUE_LENGTH) {
        throw new Error(
            `Secret ${entry.key} is too long for Bitwarden: its value encrypts to ${value.length} characters, the limit is ${MAX_ENCRYPTED_VALUE_LENGTH}`,
        );
    }

    return { key, value };
}
