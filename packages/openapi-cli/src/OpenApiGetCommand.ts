import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import type { CommandClass } from '@nzyme/cli-core/Command.js';

import type { OpenApiCommandsOptions } from './defineOpenApiCommands.js';
import { runOpenApiRequest } from './utils/runOpenApiRequest.js';

/**
 * Defines the command that sends a GET to the service with the configured credential. It can only ever
 * send GET: anything that changes data goes through the separate `write` command, so a read-only
 * permission rule can allow this one. stdout carries only the response body as one compact JSON line.
 * @__NO_SIDE_EFFECTS__
 */
export function defineOpenApiGetCommand(options: OpenApiCommandsOptions): CommandClass {
    const name = `${options.prefix} get`;

    return class OpenApiGetCommand extends Command {
        static override paths = [[options.prefix, 'get']];
        static override usage = Command.Usage({
            category: options.service,
            description: `GET a ${options.service} API path and print the response body as one line of JSON`,
            details:
                `The path is relative to ${options.baseUrl}. Exits 1 on a non-2xx status or a network ` +
                'failure, with the reason on stderr. Find paths with the schema command.',
            examples: [
                ['GET a path', `${name} /path/to/resource`],
                ['With query parameters', `${name} /path/to/resource --query limit=5 --query 'expand[]=owner'`],
            ],
        });

        requestPath = Option.String();
        query = Option.Array('--query', [], { description: 'A query parameter as key=value; repeatable' });

        run(): Promise<number> {
            return runOpenApiRequest(this.context, options, {
                method: 'GET',
                path: this.requestPath,
                query: this.query,
            });
        }
    };
}
