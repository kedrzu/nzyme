import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import type { CommandClass } from '@nzyme/cli-core/Command.js';

import type { OpenApiCommandsOptions } from './defineOpenApiCommands.js';
import { loadOpenApiSpec } from './utils/loadOpenApiSpec.js';
import {
    listGroups,
    listOperations,
    renderComponent,
    renderOperation,
    suggestNames,
} from './utils/renderOpenApiSpec.js';

/**
 * Defines the command that lets an agent browse the service's OpenAPI spec compactly instead of loading
 * the whole document. Reads the committed spec only, so it needs neither the network nor the credential.
 * @__NO_SIDE_EFFECTS__
 */
export function defineOpenApiSchemaCommand(options: OpenApiCommandsOptions): CommandClass {
    const name = `${options.prefix} schema`;

    return class OpenApiSchemaCommand extends Command {
        static override paths = [[options.prefix, 'schema']];
        static override usage = Command.Usage({
            category: options.service,
            description: `Browse the ${options.service} API spec: find operations, show one operation or schema`,
            details:
                'Without a name, lists operations as `operationId METHOD /path — summary`, narrowed by --search ' +
                'and/or --tag; with neither, lists the tags (the first path segment of an untagged operation). ' +
                'With an operationId, shows its parameters, request body fields and success response. With a ' +
                'component name, shows its fields one level deep.',
            examples: [
                ['List the tags', name],
                ['Find operations about users', `${name} --search users`],
                ['Operations of one tag', `${name} --tag users`],
                ['Show one operation or schema', `${name} <operationId or component name>`],
            ],
        });

        target = Option.String({ required: false });
        search = Option.String('--search', { description: 'Word looked up in operationId, path and summary' });
        tag = Option.String('--tag', { description: 'Only operations of this tag' });

        run(): number {
            const spec = loadOpenApiSpec(options.specPath);

            if (this.target == null) {
                if (this.search == null && this.tag == null) {
                    this.context.stdout.write(`${listGroups(spec).join('\n')}\n`);
                    return 0;
                }

                const lines = listOperations(spec, { search: this.search, tag: this.tag });
                if (lines.length === 0) {
                    this.context.stderr.write('No operations match\n');
                    return 1;
                }
                this.context.stdout.write(`${lines.join('\n')}\n`);
                return 0;
            }

            const operation = spec.operations.find(candidate => candidate.operationId === this.target);
            if (operation) {
                const text = renderOperation({ spec, operation, securityScheme: options.securityScheme });
                this.context.stdout.write(`${text}\n`);
                return 0;
            }

            if (Object.hasOwn(spec.schemas, this.target)) {
                this.context.stdout.write(`${renderComponent(this.target, spec.schemas[this.target])}\n`);
                return 0;
            }

            const suggestions = suggestNames(spec, this.target);
            const hint = suggestions.length > 0 ? ` Closest: ${suggestions.join(', ')}` : '';
            this.context.stderr.write(`Unknown operationId or schema ${this.target}.${hint}\n`);
            return 1;
        }
    };
}
