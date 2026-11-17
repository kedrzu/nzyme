import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { defineOpenApiCommands } from '@nzyme/openapi-cli/defineOpenApiCommands.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

/** Options for {@link defineDiscordCommands}. */
export interface DiscordCommandsOptions {
    /** Command prefix the commands register under, e.g. `discord` gives `discord get`. */
    prefix: string;
    /** The bot token sent as `Authorization: Bot <token>`; called only when a request is about to be sent. */
    botToken: () => string | Promise<string>;
}

/**
 * Defines `schema`, `get` and `write` commands over the Discord REST API (v10), authenticated as a bot.
 * `schema` browses the committed official OpenAPI spec offline. Requests go only to
 * `https://discord.com/api/v10`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineDiscordCommands({ prefix, botToken }: DiscordCommandsOptions): CommandClass[] {
    return defineOpenApiCommands({
        prefix,
        service: 'Discord',
        baseUrl: 'https://discord.com/api/v10',
        specPath: fileURLToPath(new URL('../openapi.json', import.meta.url)),
        authScheme: 'Bot',
        securityScheme: 'BotToken',
        credential: botToken,
        headers: { 'User-Agent': `DiscordBot (https://github.com/kedrzu/nzyme, ${readPackageVersion()})` },
    });
}

function readPackageVersion(): string {
    const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    if (!isPlainObject(manifest) || typeof manifest.version !== 'string') {
        throw new Error('@nzyme/discord-cli package.json has no version');
    }
    return manifest.version;
}
