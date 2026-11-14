import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { getCommandPaths } from '../utils/getCommandPaths.js';
import { getLinearConfig } from '../utils/getLinearConfig.js';
import { requestLinearGraphql } from '../utils/requestLinearGraphql.js';
import type { LinearGraphqlResponse } from '../utils/requestLinearGraphql.js';
import type { LinearApiCommandsOptions } from './defineLinearApiCommands.js';

/**
 * Defines the command that runs one GraphQL document against Linear with the configured API token, as the
 * agent-facing alternative to loading the Linear MCP's tools: the agent selects exactly the fields
 * it needs. stdout carries only the response's `data` as one compact JSON line; anything else
 * (GraphQL errors, an HTTP failure, bad arguments) goes to stderr with a non-zero exit code, so a
 * failure is never mistaken for an answer.
 */
export function defineLinearQueryCommand(options: LinearApiCommandsOptions): CommandClass {
    const paths = getCommandPaths(options, 'query');
    const name = (paths[0] ?? []).join(' ');

    return class LinearQueryCommand extends Command {
        static override paths = paths;
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Run a GraphQL query or mutation against the Linear API and print its data as JSON',
            details:
                'Pass `-` as the query to read it from stdin, which avoids shell quoting for multi-line documents. ' +
                'Exits 1 when Linear returns errors, even if partial data came with them. Discover the schema with ' +
                'the schema command.',
            examples: [
                ['Who am I', `${name} '{ viewer { name } }' 2>/dev/null`],
                [
                    'With variables',
                    `${name} 'query($id: String!) { issue(id: $id) { title } }' --vars '{"id":"ABC-1"}'`,
                ],
                ['A multi-line query from stdin', `${name} - <<'EOF'\n{ viewer { name } }\nEOF`],
            ],
        });

        query = Option.String();
        vars = Option.String('--vars', { description: 'Query variables as a JSON object' });

        async run(): Promise<number> {
            let variables: Record<string, unknown> | undefined;
            if (this.vars != null) {
                variables = parseVariables(this.vars);
                if (!variables) {
                    this.context.stderr.write('--vars must be a JSON object\n');
                    return 2;
                }
            }

            const query = this.query === '-' ? await readStream(this.context.stdin) : this.query;
            const { apiToken: token } = await getLinearConfig(options);

            let response: LinearGraphqlResponse;
            try {
                response = await requestLinearGraphql({ token, query, variables });
            } catch (error) {
                this.context.stderr.write(
                    `Request to Linear failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
                );
                return 1;
            }

            const { data, errors: messages } = response;

            if (messages.length > 0) {
                this.context.stderr.write(`${messages.join('\n')}\n`);
                if (data != null) {
                    this.context.stdout.write(`${JSON.stringify(data)}\n`);
                    this.context.stderr.write(
                        'The errors came with partial data, printed on stdout; do not trust it as complete\n',
                    );
                }
                return 1;
            }

            if (!response.ok || data == null) {
                const reason = !response.isJson
                    ? 'a non-JSON body'
                    : data == null && response.ok
                      ? 'no data'
                      : 'no error details';
                this.context.stderr.write(`Linear answered HTTP ${response.status} with ${reason}\n`);
                return 1;
            }

            this.context.stdout.write(`${JSON.stringify(data)}\n`);
            return 0;
        }
    };
}

function parseVariables(text: string): Record<string, unknown> | undefined {
    try {
        const parsed: unknown = JSON.parse(text);
        return isPlainObject(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

async function readStream(stream: AsyncIterable<string | Uint8Array>): Promise<string> {
    const decoder = new TextDecoder();
    let text = '';
    for await (const chunk of stream) {
        text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    }
    return text;
}
