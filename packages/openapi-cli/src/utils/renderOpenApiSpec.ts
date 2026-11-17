import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { OpenApiOperation, OpenApiSpec } from './loadOpenApiSpec.js';

const MAX_ENUM_VALUES = 8;
const MAX_SUGGESTIONS = 5;

/** Filters for {@link listOperations}; both match case-insensitively and combine with AND. */
export interface ListOperationsFilter {
    /** A word looked up in operationId, path and summary. */
    search?: string;
    /** An exact group: a tag, or the first path segment of an untagged operation. */
    tag?: string;
}

/** Lists operations one per line as `operationId METHOD /path — summary`. */
export function listOperations(spec: OpenApiSpec, filter: ListOperationsFilter): string[] {
    const search = filter.search?.toLowerCase();
    const tag = filter.tag?.toLowerCase();

    return spec.operations
        .filter(operation => {
            const matchesSearch =
                search == null ||
                [operation.operationId, operation.path, operation.summary].some(text =>
                    text.toLowerCase().includes(search),
                );
            const matchesTag = tag == null || operation.groups.some(name => name.toLowerCase() === tag);
            return matchesSearch && matchesTag;
        })
        .map(operation => `${operation.operationId} ${describeOperation(operation)}`);
}

/** Lists every group with its operation count, one `Group (n)` per line. */
export function listGroups(spec: OpenApiSpec): string[] {
    const counts = new Map<string, number>();
    for (const operation of spec.operations) {
        for (const group of operation.groups) {
            counts.set(group, (counts.get(group) ?? 0) + 1);
        }
    }
    return [...counts].map(([group, count]) => `${group} (${count})`);
}

/** Params of {@link renderOperation}. */
export interface RenderOperationParams {
    spec: OpenApiSpec;
    operation: OpenApiOperation;
    /** The security scheme the CLI's credential satisfies; an operation that does not accept it says so. */
    securityScheme?: string;
}

/**
 * Renders one operation: its description, parameters, the top-level fields of its JSON request body and
 * its success response.
 */
export function renderOperation({ spec, operation, securityScheme }: RenderOperationParams): string {
    const lines = [operation.operationId, describeOperation(operation)];
    const description = firstParagraph(operation.description);
    if (description !== '' && description !== operation.summary) {
        lines.push(description);
    }
    if (operation.tags.length > 0) {
        lines.push(`tags: ${operation.tags.join(', ')}`);
    }
    const auth = describeAuth(operation, securityScheme);
    if (auth) {
        lines.push(auth);
    }

    const parameters = operation.parameters.filter(isPlainObject).map(parameter => {
        const required = parameter.required === true ? ' required' : '';
        return `  ${String(parameter.name)} ${String(parameter.in)} ${describeSchema(parameter.schema)}${required}`;
    });
    if (parameters.length > 0) {
        lines.push('parameters:', ...parameters);
    }

    const bodySchema = readJsonSchema(operation.requestBody);
    if (bodySchema !== undefined) {
        lines.push(`body (application/json): ${describeSchema(bodySchema)}`);
        lines.push(...renderFields(resolveRef(spec, bodySchema)).map(line => `  ${line}`));
    }

    for (const status of ['200', '201', '204']) {
        const response = operation.responses[status];
        const schema = readJsonSchema(response);
        if (schema !== undefined) {
            lines.push(`response ${status}: ${describeSchema(schema)}`);
        } else if (isPlainObject(response)) {
            lines.push(`response ${status}: no JSON body`);
        }
    }

    return lines.join('\n');
}

/** Renders a component schema one level deep: a field per line, `$ref`s by name, enums compact. */
export function renderComponent(name: string, schema: unknown): string {
    const fields = renderFields(schema);
    return [`${name}: ${describeSchema(schema)}`, ...fields.map(line => `  ${line}`)].join('\n');
}

/** Names of operations and components that contain, or are contained in, the unknown `name`. */
export function suggestNames(spec: OpenApiSpec, name: string): string[] {
    const wanted = name.toLowerCase();
    const names = [...spec.operations.map(operation => operation.operationId), ...Object.keys(spec.schemas)];
    return names
        .filter(candidate => {
            const lower = candidate.toLowerCase();
            return lower.includes(wanted) || wanted.includes(lower);
        })
        .slice(0, MAX_SUGGESTIONS);
}

/**
 * A compact one-line type: `$ref` by component name, enums as `enum(a|b)`, arrays as `T[]`, formats as
 * `type(format)`, and `?` for nullable — whether by `nullable: true` (OpenAPI 3.0), a `"null"` member of a
 * `type` array or a `{ type: "null" }` member of `oneOf`/`anyOf` (OpenAPI 3.1).
 */
export function describeSchema(schema: unknown): string {
    if (!isPlainObject(schema)) {
        return 'unknown';
    }

    const nullable = schema.nullable === true || isNullableType(schema.type) ? '?' : '';

    if (typeof schema.$ref === 'string') {
        return `${schema.$ref.split('/').pop()}${nullable}`;
    }
    if (Array.isArray(schema.enum)) {
        const shown = schema.enum.slice(0, MAX_ENUM_VALUES).map(String).join('|');
        const rest = schema.enum.length - MAX_ENUM_VALUES;
        return `enum(${shown}${rest > 0 ? `|…+${rest}` : ''})${nullable}`;
    }
    for (const [key, separator] of [
        ['allOf', ' & '],
        ['oneOf', ' | '],
        ['anyOf', ' | '],
    ] as const) {
        const members = schema[key];
        if (Array.isArray(members)) {
            const rest = key === 'allOf' ? members : members.filter(member => !isNullSchema(member));
            if (rest.length === 0) {
                return 'null';
            }
            const memberNullable = rest.length < members.length && nullable === '' ? '?' : '';
            return `${rest.map(describeSchema).join(separator)}${nullable}${memberNullable}`;
        }
    }

    const types = Array.isArray(schema.type) ? schema.type.filter(type => type !== 'null') : [schema.type];
    if (types.length === 0) {
        return 'null';
    }
    return `${types.map(type => describeType(schema, type)).join(' | ')}${nullable}`;
}

function describeType(schema: Record<string, unknown>, type: unknown): string {
    if (type === 'array') {
        const items = describeSchema(schema.items);
        // `(A | B)[]`, so the array is not read as `A | (B[])`.
        return items.includes(' ') ? `(${items})[]` : `${items}[]`;
    }
    if (type === 'object' || isPlainObject(schema.properties)) {
        return isPlainObject(schema.properties) ? 'object' : 'map';
    }
    if (typeof type === 'string') {
        const format = typeof schema.format === 'string' ? `(${schema.format})` : '';
        return `${type}${format}`;
    }
    return 'unknown';
}

function isNullableType(type: unknown): boolean {
    return Array.isArray(type) && type.includes('null');
}

function isNullSchema(schema: unknown): boolean {
    return isPlainObject(schema) && schema.type === 'null';
}

function describeOperation(operation: OpenApiOperation): string {
    const summary = operation.summary === '' ? '' : ` — ${operation.summary}`;
    return `${operation.method} ${operation.path}${summary}`;
}

function describeAuth(operation: OpenApiOperation, securityScheme: string | undefined): string | undefined {
    const security = operation.security;
    if (securityScheme == null || security == null || security.length === 0) {
        return undefined;
    }
    if (security.some(schemes => schemes.length === 0 || schemes.includes(securityScheme))) {
        return undefined;
    }
    const accepted = [...new Set(security.map(schemes => schemes.join(' + ')))];
    return `auth: ${accepted.join(' or ')} (not ${securityScheme})`;
}

function firstParagraph(text: string): string {
    const [paragraph = ''] = text.trim().split(/\n\s*\n/);
    return paragraph.replaceAll(/\s*\n\s*/g, ' ').trim();
}

function renderFields(schema: unknown): string[] {
    if (!isPlainObject(schema) || !isPlainObject(schema.properties)) {
        return [];
    }

    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    return Object.entries(schema.properties).map(
        ([name, property]) => `${name}${required.has(name) ? '' : '?'}: ${describeSchema(property)}`,
    );
}

function readJsonSchema(container: unknown): unknown {
    if (!isPlainObject(container) || !isPlainObject(container.content)) {
        return undefined;
    }
    const json = container.content['application/json'];
    return isPlainObject(json) ? json.schema : undefined;
}

function resolveRef(spec: OpenApiSpec, schema: unknown): unknown {
    if (isPlainObject(schema) && typeof schema.$ref === 'string') {
        return spec.schemas[schema.$ref.split('/').pop() ?? ''];
    }
    return schema;
}
