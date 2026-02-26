import * as ts from 'typescript';

/**
 * Schema definition with metadata
 */
export interface SchemaDefinition {
    /**
     *
     */
    name: string;
    /**
     *
     */
    schema: string;
    /**
     *
     */
    description?: string;
    /**
     *
     */
    meta?: Record<string, unknown>;
}

/**
 * Transform TypeScript AST node to zod schema definition
 * @param node TypeScript interface or type alias declaration
 * @param jsDoc Optional JSDoc for extracting metadata
 * @returns Zod schema definition
 * @__NO_SIDE_EFFECTS__
 */
export function transformAstToSchema(
    node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
    jsDoc?: ts.JSDoc,
): SchemaDefinition {
    const name = node.name.text;
    const description = extractDescription(jsDoc);
    const meta = extractMeta(jsDoc);

    let schema: string;

    if (ts.isInterfaceDeclaration(node)) {
        schema = transformInterface(node);
    } else {
        schema = transformTypeAlias(node);
    }

    return {
        name,
        schema,
        description,
        meta,
    };
}

/**
 * Transform TypeScript interface declaration to zod schema
 * @param node Interface declaration node
 * @returns Zod schema string
 * @__NO_SIDE_EFFECTS__
 */
function transformInterface(node: ts.InterfaceDeclaration): string {
    const properties: string[] = [];

    for (const member of node.members) {
        if (ts.isPropertySignature(member)) {
            const propSchema = transformPropertySignature(member);
            if (propSchema) {
                properties.push(propSchema);
            }
        }
    }

    const baseSchema = `z.object({\n${properties.map(p => `        ${p}`).join(',\n')}\n    })`;

    // Get schema-level JSDoc
    const jsDocNodes = ts.getJSDocCommentsAndTags(node);
    const jsDoc = jsDocNodes.find(j => ts.isJSDoc(j));
    const meta = extractMeta(jsDoc);

    // Add .describe() if description is available
    if (meta && meta.description) {
        return `${baseSchema}\n    .describe(${JSON.stringify(meta.description)})`;
    }

    return baseSchema;
}

/**
 * Transform TypeScript type alias declaration to zod schema
 * @param node Type alias declaration node
 * @returns Zod schema string
 * @__NO_SIDE_EFFECTS__
 */
function transformTypeAlias(node: ts.TypeAliasDeclaration): string {
    return transformTypeNode(node.type);
}

/**
 * Transform TypeScript property signature to zod schema property
 * @param member Property signature node
 * @returns Zod schema property string
 * @__NO_SIDE_EFFECTS__
 */
function transformPropertySignature(member: ts.PropertySignature): string | null {
    if (!member.name || !member.type) {
        return null;
    }

    const propertyName = getPropertyName(member.name);
    const isOptional = member.questionToken !== undefined;
    const typeSchema = transformTypeNode(member.type);

    // Extract JSDoc for property
    const jsDocNodes = ts.getJSDocCommentsAndTags(member);
    const jsDoc = jsDocNodes.find(j => ts.isJSDoc(j));
    const description = extractDescription(jsDoc);
    const meta = extractMeta(jsDoc);

    let schema = typeSchema;

    // Add .describe() for @description tags
    if (meta && meta.description) {
        schema = `${schema}.describe(${JSON.stringify(meta.description)})`;
    }

    // Handle optional properties
    if (isOptional) {
        schema = `z.optional(${schema})`;
    }

    // Add inline comment if description exists
    const comment = description ? `/** ${description} */` : '';

    return comment ? `${comment}\n        ${propertyName}: ${schema}` : `${propertyName}: ${schema}`;
}

/**
 * Transform TypeScript type node to zod schema
 * @param typeNode Type node to transform
 * @returns Zod schema string
 * @__NO_SIDE_EFFECTS__
 */
function transformTypeNode(typeNode: ts.TypeNode): string {
    switch (typeNode.kind) {
        case ts.SyntaxKind.AnyKeyword:
            return 'z.any()';
        case ts.SyntaxKind.ArrayType:
            return transformArrayType(typeNode as ts.ArrayTypeNode);
        case ts.SyntaxKind.BooleanKeyword:
            return 'z.boolean()';
        case ts.SyntaxKind.LiteralType:
            return transformLiteralType(typeNode as ts.LiteralTypeNode);
        case ts.SyntaxKind.NullKeyword:
            return 'z.null()';
        case ts.SyntaxKind.NumberKeyword:
            return 'z.number()';
        case ts.SyntaxKind.ParenthesizedType:
            return transformTypeNode((typeNode as ts.ParenthesizedTypeNode).type);
        case ts.SyntaxKind.StringKeyword:
            return 'z.string()';
        case ts.SyntaxKind.TypeLiteral:
            return transformTypeLiteral(typeNode as ts.TypeLiteralNode);
        case ts.SyntaxKind.TypeReference:
            return transformTypeReference(typeNode as ts.TypeReferenceNode);
        case ts.SyntaxKind.UndefinedKeyword:
            return 'z.undefined()';
        case ts.SyntaxKind.UnionType:
            return transformUnionType(typeNode as ts.UnionTypeNode);
        case ts.SyntaxKind.UnknownKeyword:
            return 'z.unknown()';
        case ts.SyntaxKind.VoidKeyword:
            return 'z.void()';
        default:
            // Fallback to unknown for unsupported types
            console.error('Unsupported type kind:', ts.SyntaxKind[typeNode.kind], typeNode.kind);
            return 'z.unknown()';
    }
}

/**
 * Transform TypeScript array type to zod schema
 * @param node Array type node
 * @returns Zod schema string
 * @__NO_SIDE_EFFECTS__
 */
function transformArrayType(node: ts.ArrayTypeNode): string {
    const elementSchema = transformTypeNode(node.elementType);
    return `z.array(${elementSchema})`;
}

/**
 * Transform TypeScript union type to zod schema
 * @param node Union type node
 * @returns Zod schema string
 * @__NO_SIDE_EFFECTS__
 */
function transformUnionType(node: ts.UnionTypeNode): string {
    const schemas = node.types.map(type => transformTypeNode(type));

    // Check for nullable (T | null) pattern
    const nullIndex = schemas.findIndex(s => s === 'z.null()');
    const undefinedIndex = schemas.findIndex(s => s === 'z.undefined()');

    if (nullIndex !== -1 && undefinedIndex !== -1 && schemas.length === 3) {
        const otherSchema = schemas.find((_, i) => i !== nullIndex && i !== undefinedIndex);
        if (otherSchema) {
            return `z.nullish(${otherSchema})`;
        }
    }

    if (nullIndex !== -1 && schemas.length === 2) {
        const otherSchema = schemas[nullIndex === 0 ? 1 : 0];
        return `z.nullable(${otherSchema})`;
    }

    if (undefinedIndex !== -1 && schemas.length === 2) {
        const otherSchema = schemas[undefinedIndex === 0 ? 1 : 0];
        return `z.optional(${otherSchema})`;
    }

    // Check if all members are string literals - use z.enum() instead
    const allStringLiterals = node.types.every(
        type => ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal),
    );

    if (allStringLiterals) {
        const values = node.types.map(type => {
            const literal = (type as ts.LiteralTypeNode).literal as ts.StringLiteral;
            return `'${escapeString(literal.text)}'`;
        });
        return `z.enum([${values.join(', ')}])`;
    }

    return `z.union([${schemas.join(', ')}])`;
}

/**
 * Transform TypeScript type literal to zod schema
 * @param node Type literal node
 * @returns Zod schema string
 * @__NO_SIDE_EFFECTS__
 */
function transformTypeLiteral(node: ts.TypeLiteralNode): string {
    const properties: string[] = [];

    for (const member of node.members) {
        if (ts.isPropertySignature(member)) {
            const propSchema = transformPropertySignature(member);
            if (propSchema) {
                properties.push(propSchema);
            }
        }
    }

    return `z.object({\n${properties.map(p => `  ${p}`).join(',\n')}\n})`;
}

/**
 * Transform TypeScript literal type to zod schema
 * @param node Literal type node
 * @returns Zod schema string
 * @__NO_SIDE_EFFECTS__
 */
function transformLiteralType(node: ts.LiteralTypeNode): string {
    if (ts.isStringLiteral(node.literal)) {
        return `z.literal('${escapeString(node.literal.text)}')`;
    } else if (ts.isNumericLiteral(node.literal)) {
        return `z.literal(${node.literal.text})`;
    } else if (node.literal.kind === ts.SyntaxKind.TrueKeyword) {
        return 'z.literal(true)';
    } else if (node.literal.kind === ts.SyntaxKind.FalseKeyword) {
        return 'z.literal(false)';
    } else if (node.literal.kind === ts.SyntaxKind.NullKeyword) {
        return 'z.null()';
    }

    console.error('Unsupported literal type:', ts.SyntaxKind[node.literal.kind], node.literal.kind);
    return 'z.unknown()';
}

/**
 * Transform TypeScript type reference to zod schema
 * @param node Type reference node
 * @returns Zod schema string
 * @__NO_SIDE_EFFECTS__
 */
function transformTypeReference(node: ts.TypeReferenceNode): string {
    const typeName = node.typeName.getText();

    // Handle built-in types
    switch (typeName) {
        case 'Array':
            if (node.typeArguments && node.typeArguments.length === 1) {
                const elementArg = node.typeArguments[0];
                if (elementArg) {
                    const elementSchema = transformTypeNode(elementArg);
                    return `z.array(${elementSchema})`;
                }
            }
            return 'z.array(z.unknown())';
        case 'Date':
            return 'z.date()';
        case 'Record':
            if (node.typeArguments && node.typeArguments.length === 2) {
                const keyArg = node.typeArguments[0];
                const valueArg = node.typeArguments[1];
                if (keyArg && valueArg) {
                    const keySchema = transformTypeNode(keyArg);
                    const valueSchema = transformTypeNode(valueArg);
                    return `z.record(${keySchema}, ${valueSchema})`;
                }
            }
            return 'z.record(z.string(), z.unknown())';
        default:
            // For custom types, assume they will be defined elsewhere
            // For generic type parameters, use unknown for now
            if (typeName === 'T' || typeName.length === 1) {
                return `z.unknown() /* Generic type ${typeName} */`;
            }
            return `${typeName}Schema`;
    }
}

/**
 * Get property name from property signature name
 * @param name Property name node
 * @returns Property name string
 * @__NO_SIDE_EFFECTS__
 */
function getPropertyName(name: ts.PropertyName): string {
    if (ts.isIdentifier(name)) {
        return name.text;
    } else if (ts.isStringLiteral(name)) {
        return `'${escapeString(name.text)}'`;
    } else if (ts.isNumericLiteral(name)) {
        return name.text;
    } else if (ts.isComputedPropertyName(name)) {
        return `[${name.expression.getText()}]`;
    }

    return 'unknown';
}

/**
 * Extract description from JSDoc
 * @param jsDoc JSDoc node
 * @returns Description string if found
 * @__NO_SIDE_EFFECTS__
 */
function extractDescription(jsDoc?: ts.JSDoc): string | undefined {
    if (!jsDoc || !jsDoc.comment) {
        return undefined;
    }

    if (typeof jsDoc.comment === 'string') {
        return jsDoc.comment.trim();
    }

    // Handle NodeArray of JSDocComment
    return jsDoc.comment
        .map(part => {
            if (typeof part === 'string') {
                return part;
            }
            return part.text || '';
        })
        .join('')
        .trim();
}

/**
 * Extract metadata from JSDoc tags
 * @param jsDoc JSDoc node
 * @returns Metadata object
 * @__NO_SIDE_EFFECTS__
 */
function extractMeta(jsDoc?: ts.JSDoc): Record<string, unknown> | undefined {
    if (!jsDoc || !jsDoc.tags) {
        return undefined;
    }

    const meta: Record<string, unknown> = {};

    for (const tag of jsDoc.tags) {
        if (tag && tag.tagName) {
            const tagName = tag.tagName.text;
            const comment = tag.comment;

            if (comment) {
                if (typeof comment === 'string') {
                    meta[tagName] = comment.trim();
                } else {
                    meta[tagName] = comment
                        .map(part => {
                            if (typeof part === 'string') {
                                return part;
                            }
                            return part.text || '';
                        })
                        .join('')
                        .trim();
                }
            } else {
                meta[tagName] = true;
            }
        }
    }

    return Object.keys(meta).length > 0 ? meta : undefined;
}

/**
 * Escape string for safe inclusion in generated code
 * @param str String to escape
 * @returns Escaped string
 * @__NO_SIDE_EFFECTS__
 */
function escapeString(str: string): string {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}
