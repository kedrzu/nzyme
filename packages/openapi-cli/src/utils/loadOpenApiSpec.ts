import { readFileSync } from 'node:fs';

import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

/** One operation of the spec, flattened from `paths`. */
export interface OpenApiOperation {
    operationId: string;
    method: string;
    path: string;
    summary: string;
    description: string;
    /** The operation's `tags`, or its first path segment when it has none. */
    groups: string[];
    tags: string[];
    /** The path item's parameters merged with the operation's own, which win on `name` + `in`. */
    parameters: unknown[];
    requestBody: unknown;
    responses: Record<string, unknown>;
    /**
     * The scheme names of each alternative of the operation's `security`, or of the document's global
     * security when the operation has none; `undefined` when neither declares any. An empty alternative
     * means no authentication is required.
     */
    security: string[][] | undefined;
}

/** The parts of an OpenAPI document the `schema` command reads. */
export interface OpenApiSpec {
    operations: OpenApiOperation[];
    /** `components.schemas` by component name. */
    schemas: Record<string, unknown>;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const specs = new Map<string, OpenApiSpec>();

/**
 * Loads a committed OpenAPI JSON document without any network call, parsed once per process and path,
 * so one process can define commands for several services.
 */
export function loadOpenApiSpec(specPath: string): OpenApiSpec {
    let spec = specs.get(specPath);
    if (!spec) {
        spec = parseOpenApiSpec(specPath, JSON.parse(readFileSync(specPath, 'utf8')));
        specs.set(specPath, spec);
    }

    return spec;
}

function parseOpenApiSpec(specPath: string, document: unknown): OpenApiSpec {
    if (!isPlainObject(document) || !isPlainObject(document.paths)) {
        throw new Error(`${specPath} is not an OpenAPI document with paths`);
    }

    const globalSecurity = readSecurity(document.security);
    const operations: OpenApiOperation[] = [];
    for (const [path, item] of Object.entries(document.paths)) {
        if (!isPlainObject(item)) {
            continue;
        }
        const itemParameters = Array.isArray(item.parameters) ? item.parameters : [];
        for (const method of METHODS) {
            const operation = item[method];
            if (isPlainObject(operation) && typeof operation.operationId === 'string') {
                const tags = Array.isArray(operation.tags) ? operation.tags.filter(tag => typeof tag === 'string') : [];
                const ownParameters = Array.isArray(operation.parameters) ? operation.parameters : [];
                operations.push({
                    operationId: operation.operationId,
                    method: method.toUpperCase(),
                    path,
                    summary: typeof operation.summary === 'string' ? operation.summary : '',
                    description: typeof operation.description === 'string' ? operation.description : '',
                    groups: tags.length > 0 ? tags : [path.split('/').find(segment => segment !== '') ?? '/'],
                    tags,
                    parameters: mergeParameters(itemParameters, ownParameters),
                    requestBody: operation.requestBody,
                    responses: isPlainObject(operation.responses) ? operation.responses : {},
                    security: readSecurity(operation.security) ?? globalSecurity,
                });
            }
        }
    }

    const components = isPlainObject(document.components) ? document.components : {};
    return { operations, schemas: isPlainObject(components.schemas) ? components.schemas : {} };
}

function mergeParameters(itemParameters: unknown[], ownParameters: unknown[]): unknown[] {
    const overridden = new Set(ownParameters.map(parameterKey));
    return [...itemParameters.filter(parameter => !overridden.has(parameterKey(parameter))), ...ownParameters];
}

function parameterKey(parameter: unknown): string {
    return isPlainObject(parameter) ? `${String(parameter.in)}:${String(parameter.name)}` : '';
}

function readSecurity(security: unknown): string[][] | undefined {
    if (!Array.isArray(security)) {
        return undefined;
    }
    return security.filter(isPlainObject).map(requirement => Object.keys(requirement));
}
