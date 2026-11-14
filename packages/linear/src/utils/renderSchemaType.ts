import { isEnumType, isInputObjectType, isInterfaceType, isObjectType, isScalarType, isUnionType } from 'graphql';
import type { GraphQLNamedType, GraphQLSchema } from 'graphql';

export interface RenderSchemaTypeOptions {
    /** Append each type's/field's description, cut to its first sentence, as a `# …` comment. */
    descriptions?: boolean;
    /** Keep only the fields whose name contains this word (case-insensitive). */
    search?: string;
}

/**
 * Renders one schema type as a compact listing, so an agent can discover the schema one type at a
 * time instead of loading all of it: a field per line as `name(arg: Type): Type` (`name: Type` for
 * input types), enum values, union members or the scalar's name. Returns `null` for an unknown type.
 */
export function renderSchemaType(
    schema: GraphQLSchema,
    typeName: string,
    options: RenderSchemaTypeOptions = {},
): string | null {
    const type = schema.getType(typeName);
    if (!type) {
        return null;
    }

    const lines = [`${describeKind(type)} ${type.name}${comment(type.description, options)}`];
    const search = options.search?.toLowerCase();
    const matches = (name: string) => !search || name.toLowerCase().includes(search);

    if (isObjectType(type) || isInterfaceType(type)) {
        for (const field of Object.values(type.getFields())) {
            if (matches(field.name)) {
                const args = field.args.map(arg => `${arg.name}: ${arg.type.toString()}`).join(', ');
                const signature = args ? `${field.name}(${args})` : field.name;
                lines.push(`${signature}: ${field.type.toString()}${comment(field.description, options)}`);
            }
        }
    } else if (isInputObjectType(type)) {
        for (const field of Object.values(type.getFields())) {
            if (matches(field.name)) {
                lines.push(`${field.name}: ${field.type.toString()}${comment(field.description, options)}`);
            }
        }
    } else if (isEnumType(type)) {
        for (const value of type.getValues()) {
            lines.push(`${value.name}${comment(value.description, options)}`);
        }
    } else if (isUnionType(type)) {
        for (const member of type.getTypes()) {
            lines.push(member.name);
        }
    }

    if (lines.length === 1 && search) {
        lines.push(`(no field matches "${options.search}")`);
    }

    return lines.join('\n');
}

function describeKind(type: GraphQLNamedType): string {
    if (isObjectType(type)) {
        return 'type';
    }
    if (isInterfaceType(type)) {
        return 'interface';
    }
    if (isInputObjectType(type)) {
        return 'input';
    }
    if (isEnumType(type)) {
        return 'enum';
    }
    if (isUnionType(type)) {
        return 'union';
    }
    if (isScalarType(type)) {
        return 'scalar';
    }
    return 'type';
}

function comment(description: string | null | undefined, options: RenderSchemaTypeOptions): string {
    if (!options.descriptions || !description) {
        return '';
    }

    const firstLine = description.trim().split('\n')[0] ?? '';
    const sentenceEnd = firstLine.search(/[.!?](\s|$)/);
    const sentence = sentenceEnd === -1 ? firstLine : firstLine.slice(0, sentenceEnd + 1);
    return sentence ? `  # ${sentence}` : '';
}
