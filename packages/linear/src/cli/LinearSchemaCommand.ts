import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import type { CommandClass } from '@nzyme/cli-core/Command.js';

import { getCommandPaths } from '../utils/getCommandPaths.js';
import { loadLinearSchema } from '../utils/loadLinearSchema.js';
import { renderSchemaType } from '../utils/renderSchemaType.js';
import { searchSchema, suggestTypeNames } from '../utils/searchSchema.js';
import type { LinearApiCommandsOptions } from './defineLinearApiCommands.js';

/**
 * Defines the command that lets an agent discover Linear's GraphQL schema one type at a time instead of loading the 1.36 MB
 * document. Reads the committed schema, so it never touches the network or the token.
 */
export function defineLinearSchemaCommand(options: LinearApiCommandsOptions): CommandClass {
    const paths = getCommandPaths(options, 'schema');
    const name = (paths[0] ?? []).join(' ');

    return class LinearSchemaCommand extends Command {
        static override paths = paths;
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Show one Linear GraphQL type compactly, or search the schema by name',
            details:
                'Prints a field per line as `name(arg: Type): Type` for object, interface and input types, the values of ' +
                'an enum, the members of a union. `Query` and `Mutation` are types too. Without a type, --search lists ' +
                'matching type names and `Type.field` names.',
            examples: [
                ['Fields of Issue', `${name} Issue`],
                ['With one-line descriptions', `${name} Issue --descriptions`],
                ['Mutations about issues', `${name} Mutation --search issue`],
                ['Find where delegates appear', `${name} --search delegate`],
            ],
        });

        typeName = Option.String({ required: false });
        search = Option.String('--search', { description: 'Word to narrow fields (with a type) or search all names' });
        descriptions = Option.Boolean('--descriptions', false, {
            description: 'Append each description, cut to its first sentence, as a # comment',
        });

        run(): number {
            const schema = loadLinearSchema();

            if (!this.typeName) {
                if (!this.search) {
                    this.context.stderr.write('Pass a type name, or --search <word>\n');
                    return 2;
                }

                this.context.stdout.write(`${searchSchema(schema, this.search)}\n`);
                return 0;
            }

            const rendered = renderSchemaType(schema, this.typeName, {
                descriptions: this.descriptions,
                search: this.search,
            });
            if (rendered == null) {
                const suggestions = suggestTypeNames(schema, this.typeName);
                const hint = suggestions.length > 0 ? ` Closest: ${suggestions.join(', ')}` : '';
                this.context.stderr.write(`Unknown type ${this.typeName}.${hint}\n`);
                return 1;
            }

            this.context.stdout.write(`${rendered}\n`);
            return 0;
        }
    };
}
