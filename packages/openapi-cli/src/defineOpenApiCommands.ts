import type { CommandClass } from '@nzyme/cli-core/Command.js';
import type { Container } from '@nzyme/ioc/Container.js';

import { defineOpenApiGetCommand } from './OpenApiGetCommand.js';
import { defineOpenApiSchemaCommand } from './OpenApiSchemaCommand.js';
import { defineOpenApiWriteCommand } from './OpenApiWriteCommand.js';

/** What `credential` receives when a command is about to send a request. */
export interface OpenApiCredentialContext {
    /**
     * The running command's scoped container (`CommandScope`), so the credential can come from a service
     * resolved per command run. Throws when the request was run through {@link runOpenApiRequest} without one.
     */
    container: Container;
}

/** Options for {@link defineOpenApiCommands}: everything that makes the commands talk to one service. */
export interface OpenApiCommandsOptions {
    /** Command prefix the commands register under, e.g. `discord` gives `discord get`. */
    prefix: string;
    /** Name of the service, used as the help category and in failure lines: `Discord GET /x failed: 404`. */
    service: string;
    /** The base every request path is relative to, without a trailing slash. */
    baseUrl: string;
    /** Absolute path of the committed OpenAPI JSON document; read lazily, once per process. */
    specPath: string;
    /** The scheme word of the `Authorization` header, e.g. `Bearer` or `Bot`. */
    authScheme: string;
    /**
     * The secret sent as `Authorization: <authScheme> <credential>`. Called only when a request is about
     * to be sent, so `schema` and a usage error never resolve it. A callback that ignores its argument works as before.
     */
    credential: (context: OpenApiCredentialContext) => string | Promise<string>;
    /** Fixed extra headers sent with every request, e.g. a `User-Agent` the service requires. */
    headers?: Record<string, string>;
    /**
     * The security scheme of the spec that `credential` satisfies. An operation whose `security` (or the
     * document's global security) does not accept it gets an `auth:` line in `schema`, naming the schemes
     * it does accept, so an agent knows the call will be refused before making it.
     */
    securityScheme?: string;
}

/**
 * Defines the commands that give an agent direct, token-cheap access to an OpenAPI REST service:
 * `schema` browses the committed OpenAPI spec offline, `get` sends a GET, `write` sends a POST, PUT, PATCH
 * or DELETE. Registered under `prefix`, e.g. `discord get`.
 * @__NO_SIDE_EFFECTS__
 */
export function defineOpenApiCommands(options: OpenApiCommandsOptions): CommandClass[] {
    return [defineOpenApiSchemaCommand(options), defineOpenApiGetCommand(options), defineOpenApiWriteCommand(options)];
}
