import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { transformAstToSchema } from './astToSchema.js';

/**
 * Helper function to create a TypeScript interface from source code
 */
function createInterfaceFromSource(source: string): ts.InterfaceDeclaration {
    const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.Latest, true);

    const interfaceNode = sourceFile.statements.find(ts.isInterfaceDeclaration);
    if (!interfaceNode) {
        throw new Error('No interface found in source');
    }

    return interfaceNode;
}

/**
 * Helper function to create a TypeScript type alias from source code
 */
function createTypeAliasFromSource(source: string): ts.TypeAliasDeclaration {
    const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.Latest, true);

    const typeNode = sourceFile.statements.find(ts.isTypeAliasDeclaration);
    if (!typeNode) {
        throw new Error('No type alias found in source');
    }

    return typeNode;
}

describe('transformAstToSchema', () => {
    describe('primitive types', () => {
        it('should transform string type', () => {
            const source = 'interface Test { name: string; }';
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.name).toBe('Test');
            expect(result.schema).toContain('s.string()');
        });

        it('should transform number type', () => {
            const source = 'interface Test { age: number; }';
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain('s.number()');
        });

        it('should transform boolean type', () => {
            const source = 'interface Test { active: boolean; }';
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain('s.boolean()');
        });
    });

    describe('optional properties', () => {
        it('should handle optional properties', () => {
            const source = 'interface Test { name?: string; }';
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain('s.optional(s.string())');
        });

        it('should handle required properties', () => {
            const source = 'interface Test { name: string; }';
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain('s.string()');
            expect(result.schema).not.toContain('s.optional(');
        });
    });

    describe('array types', () => {
        it('should transform simple array types', () => {
            const source = 'interface Test { items: string[]; }';
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain('s.array(s.string())');
        });

        it('should transform generic array types', () => {
            const source = 'interface Test { items: Array<number>; }';
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain('s.array(s.number())');
        });

        it('should transform nested array types', () => {
            const source = 'interface Test { matrix: number[][]; }';
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain('s.array(s.array(s.number()))');
        });
    });

    describe('union types', () => {
        it('should transform simple union types', () => {
            const source = 'type Test = string | number;';
            const node = createTypeAliasFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain('s.union(s.string(), s.number())');
        });

        it('should handle nullable types (T | null)', () => {
            const source = 'type Test = string | null;';
            const node = createTypeAliasFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toBe('s.nullable(s.string())');
        });

        it('should handle optional types (T | undefined)', () => {
            const source = 'type Test = string | undefined;';
            const node = createTypeAliasFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toBe('s.optional(s.string())');
        });

        it('should transform literal union types', () => {
            const source = "type Test = 'red' | 'green' | 'blue';";
            const node = createTypeAliasFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain("s.literal('red')");
            expect(result.schema).toContain("s.literal('green')");
            expect(result.schema).toContain("s.literal('blue')");
        });
    });

    describe('object types', () => {
        it('should transform simple object interface', () => {
            const source = `
interface User {
  name: string;
  age: number;
  active: boolean;
}`;
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain('s.object({');
            expect(result.schema).toContain('name: s.string()');
            expect(result.schema).toContain('age: s.number()');
            expect(result.schema).toContain('active: s.boolean()');
        });

        it('should transform nested object types', () => {
            const source = `
interface Test {
  user: {
    name: string;
    age: number;
  };
}`;
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain('s.object({');
            expect(result.schema).toContain('user: s.object({');
            expect(result.schema).toContain('name: s.string()');
            expect(result.schema).toContain('age: s.number()');
        });
    });

    describe('literal types', () => {
        it('should transform string literals', () => {
            const source = "type Test = 'hello';";
            const node = createTypeAliasFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toBe("s.literal('hello')");
        });

        it('should transform number literals', () => {
            const source = 'type Test = 42;';
            const node = createTypeAliasFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toBe('s.literal(42)');
        });

        it('should transform boolean literals', () => {
            const source = 'type Test = true;';
            const node = createTypeAliasFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toBe('s.literal(true)');
        });
    });

    describe('built-in type references', () => {
        it('should transform Date type', () => {
            const source = 'interface Test { created: Date; }';
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain('s.date()');
        });

        it('should transform Record type', () => {
            const source = 'interface Test { data: Record<string, number>; }';
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.schema).toContain('s.record(s.string(), s.number())');
        });
    });

    describe('complex scenarios', () => {
        it('should handle complex nested structure', () => {
            const source = `
interface ApiResponse {
  data: {
    users: Array<{
      id: number;
      name: string;
      roles: ('admin' | 'user')[];
      profile?: {
        avatar: string | null;
        settings: Record<string, boolean>;
      };
    }>;
  };
  meta: {
    total: number;
    page: number;
  };
  errors?: string[];
}`;
            const node = createInterfaceFromSource(source);
            const result = transformAstToSchema(node);

            expect(result.name).toBe('ApiResponse');
            expect(result.schema).toContain('s.object({');
            expect(result.schema).toContain('data: s.object({');
            expect(result.schema).toContain('users: s.array(s.object({');
            expect(result.schema).toContain('id: s.number()');
            expect(result.schema).toContain('profile: s.optional(s.object({');
            expect(result.schema).toContain('s.optional(');
            expect(result.schema).toContain('s.nullable(');
        });
    });

    describe('JSDoc handling', () => {
        it('should extract description from JSDoc', () => {
            const source = `
/**
 * A user in the system
 */
interface User {
  name: string;
}`;
            const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.Latest, true);
            const interfaceNode = sourceFile.statements.find(ts.isInterfaceDeclaration)!;
            const jsDoc = ts.getJSDocCommentsAndTags(interfaceNode).find(j => ts.isJSDoc(j)) as ts.JSDoc;

            const result = transformAstToSchema(interfaceNode, jsDoc);

            expect(result.description).toContain('A user in the system');
        });

        it('should extract meta from JSDoc tags', () => {
            const source = `
/**
 * A user entity
 * @since 1.0.0
 * @author John Doe
 * @deprecated
 */
interface User {
  name: string;
}`;
            const sourceFile = ts.createSourceFile('test.ts', source, ts.ScriptTarget.Latest, true);
            const interfaceNode = sourceFile.statements.find(ts.isInterfaceDeclaration)!;
            const jsDoc = ts.getJSDocCommentsAndTags(interfaceNode).find(j => ts.isJSDoc(j)) as ts.JSDoc;

            const result = transformAstToSchema(interfaceNode, jsDoc);

            expect(result.meta).toBeDefined();
            expect(result.meta?.since).toBe('1.0.0');
            expect(result.meta?.author).toBe('John Doe');
            expect(result.meta?.deprecated).toBe(true);
        });
    });
});
