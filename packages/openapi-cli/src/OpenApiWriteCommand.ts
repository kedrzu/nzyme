import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import type { CommandClass } from '@nzyme/cli-core/Command.js';

import type { OpenApiCommandsOptions } from './defineOpenApiCommands.js';
import { readStream } from './utils/readStream.js';
import { runOpenApiRequest } from './utils/runOpenApiRequest.js';
import type { OpenApiMethod } from './utils/runOpenApiRequest.js';

const WRITE_METHODS: OpenApiMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Defines the command that sends a POST, PUT, PATCH or DELETE to the service with the configured
 * credential, and rejects every other method including GET (that is the `get` command). Writes change
 * data, so they live behind their own command that a permission rule can hold for confirmation.
 * @__NO_SIDE_EFFECTS__
 */
export function defineOpenApiWriteCommand(options: OpenApiCommandsOptions): CommandClass {
    const name = `${options.prefix} write`;

    return class OpenApiWriteCommand extends Command {
        static override paths = [[options.prefix, 'write']];
        static override usage = Command.Usage({
            category: options.service,
            description: `POST, PUT, PATCH or DELETE a ${options.service} API path with an optional JSON body`,
            details:
                `The path is relative to ${options.baseUrl}. Pass \`--data -\` to read the JSON body from ` +
                'stdin. Prints the response body as one line of JSON; exits 1 on a non-2xx status or a ' +
                'network failure.',
            examples: [
                ['Create something', `${name} POST /things --data '{"name":"x"}'`],
                ['Body from stdin', `${name} PUT /things/2 --data - <<'EOF'\n{"name":"y"}\nEOF`],
                ['Delete', `${name} DELETE /things/2`],
            ],
        });

        method = Option.String();
        requestPath = Option.String();
        data = Option.String('--data', { description: 'The JSON request body, or `-` to read it from stdin' });
        query = Option.Array('--query', [], { description: 'A query parameter as key=value; repeatable' });

        async run(): Promise<number> {
            const method = WRITE_METHODS.find(candidate => candidate === this.method.toUpperCase());
            if (!method) {
                this.context.stderr.write(`write sends ${WRITE_METHODS.join(', ')}; use the get command for GET\n`);
                return 2;
            }

            const body = this.data === '-' ? await readStream(this.context.stdin) : this.data;
            if (body != null && !isJson(body)) {
                this.context.stderr.write('--data must be valid JSON\n');
                return 2;
            }

            return await runOpenApiRequest(this.context, options, {
                method,
                path: this.requestPath,
                query: this.query,
                body,
            });
        }
    };
}

function isJson(text: string): boolean {
    try {
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
}
