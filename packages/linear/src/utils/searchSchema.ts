import { isInputObjectType, isInterfaceType, isObjectType } from 'graphql';
import type { GraphQLInputObjectType, GraphQLInterfaceType, GraphQLObjectType, GraphQLSchema } from 'graphql';

/** Most lines `searchSchema` prints, so a broad word cannot flood the agent's context. */
const SEARCH_LIMIT = 40;

/** How many type names the unknown-type error suggests. */
const SUGGESTION_LIMIT = 5;

/**
 * Finds schema names containing a word (case-insensitive): type names, and fields as `Type.field`,
 * one per line. Capped, with a last line saying how many more matched.
 */
export function searchSchema(schema: GraphQLSchema, word: string): string {
    const needle = word.toLowerCase();
    const matches: string[] = [];

    for (const type of listTypes(schema)) {
        if (type.name.toLowerCase().includes(needle)) {
            matches.push(type.name);
        }
        if (isObjectType(type) || isInterfaceType(type) || isInputObjectType(type)) {
            for (const field of listFields(type)) {
                if (field.name.toLowerCase().includes(needle)) {
                    matches.push(`${type.name}.${field.name}`);
                }
            }
        }
    }

    if (matches.length === 0) {
        return `Nothing in the schema matches "${word}"`;
    }

    const lines = matches.slice(0, SEARCH_LIMIT);
    if (matches.length > SEARCH_LIMIT) {
        lines.push(`… and ${matches.length - SEARCH_LIMIT} more matches; narrow the search`);
    }
    return lines.join('\n');
}

/** Up to five type names closest to a mistyped one (case-insensitive substring either way). */
export function suggestTypeNames(schema: GraphQLSchema, typeName: string): string[] {
    const needle = typeName.toLowerCase();
    return listTypes(schema)
        .map(type => type.name)
        .filter(name => {
            const lower = name.toLowerCase();
            return lower.includes(needle) || needle.includes(lower);
        })
        .slice(0, SUGGESTION_LIMIT);
}

/** The fields of a type that has them, typed once so the three field-map shapes need no union call. */
function listFields(type: GraphQLObjectType | GraphQLInterfaceType | GraphQLInputObjectType): { name: string }[] {
    return Object.values<{ name: string }>(type.getFields());
}

function listTypes(schema: GraphQLSchema) {
    return Object.values(schema.getTypeMap()).filter(type => !type.name.startsWith('__'));
}
