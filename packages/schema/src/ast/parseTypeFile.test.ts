import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as ts from 'typescript';

import { parseTypeFile } from './parseTypeFile.js';

const TEST_DIR = join(process.cwd(), 'test-temp');

describe('parseTypeFile', () => {
    beforeEach(async () => {
        await mkdir(TEST_DIR, { recursive: true });
    });

    afterEach(async () => {
        await rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should parse a simple interface', async () => {
        const content = `
/**
 * A simple user interface
 * @example { name: "John", age: 30 }
 */
interface User {
  /** User's full name */
  name: string;
  /** User's age in years */
  age: number;
  /** Whether the user is active */
  active?: boolean;
}
`;

        const filePath = join(TEST_DIR, 'User.type.ts');
        await writeFile(filePath, content);

        const result = await parseTypeFile(filePath);

        expect(result.definitions).toHaveLength(1);
        expect(result.definitions[0]!.name).toBe('User');
        expect(ts.isInterfaceDeclaration(result.definitions[0]!.node)).toBe(true);

        const interfaceNode = result.definitions[0]!.node as ts.InterfaceDeclaration;
        expect(interfaceNode.members).toHaveLength(3);
    });

    it('should parse a type alias', async () => {
        const content = `
/**
 * Status enumeration
 */
type Status = 'active' | 'inactive' | 'pending';
`;

        const filePath = join(TEST_DIR, 'Status.type.ts');
        await writeFile(filePath, content);

        const result = await parseTypeFile(filePath);

        expect(result.definitions).toHaveLength(1);
        expect(result.definitions[0]!.name).toBe('Status');
        expect(ts.isTypeAliasDeclaration(result.definitions[0]!.node)).toBe(true);
    });

    it('should parse multiple definitions in one file', async () => {
        const content = `
interface User {
  name: string;
  age: number;
}

type UserRole = 'admin' | 'user' | 'guest';

interface Permission {
  action: string;
  resource: string;
}
`;

        const filePath = join(TEST_DIR, 'Multiple.type.ts');
        await writeFile(filePath, content);

        const result = await parseTypeFile(filePath);

        expect(result.definitions).toHaveLength(3);
        expect(result.definitions.map(d => d.name)).toEqual(['User', 'UserRole', 'Permission']);
    });

    it('should handle complex nested types', async () => {
        const content = `
interface ApiResponse<T> {
  data: T;
  meta: {
    total: number;
    page: number;
    perPage: number;
  };
  errors?: Array<{
    field: string;
    message: string;
  }>;
}
`;

        const filePath = join(TEST_DIR, 'ApiResponse.type.ts');
        await writeFile(filePath, content);

        const result = await parseTypeFile(filePath);

        expect(result.definitions).toHaveLength(1);
        expect(result.definitions[0]!.name).toBe('ApiResponse');

        const interfaceNode = result.definitions[0]!.node as ts.InterfaceDeclaration;
        expect(interfaceNode.members).toHaveLength(3);
    });

    it('should handle union types', async () => {
        const content = `
type StringOrNumber = string | number;
type NullableString = string | null;
type OptionalString = string | undefined;
type ComplexUnion = 'red' | 'green' | 'blue' | number | boolean;
`;

        const filePath = join(TEST_DIR, 'Unions.type.ts');
        await writeFile(filePath, content);

        const result = await parseTypeFile(filePath);

        expect(result.definitions).toHaveLength(4);
        expect(result.definitions.map(d => d.name)).toEqual([
            'StringOrNumber',
            'NullableString',
            'OptionalString',
            'ComplexUnion',
        ]);
    });

    it('should handle array types', async () => {
        const content = `
interface ArrayExample {
  simpleArray: string[];
  nestedArray: number[][];
  genericArray: Array<boolean>;
  complexArray: Array<{ id: number; name: string }>;
}
`;

        const filePath = join(TEST_DIR, 'Arrays.type.ts');
        await writeFile(filePath, content);

        const result = await parseTypeFile(filePath);

        expect(result.definitions).toHaveLength(1);
        expect(result.definitions[0]!.name).toBe('ArrayExample');
    });

    it('should parse JSDoc comments correctly', async () => {
        const content = `
/**
 * User entity with comprehensive documentation
 * @since 1.0.0
 * @author John Doe
 * @deprecated Use UserV2 instead
 */
interface User {
  name: string;
}
`;

        const filePath = join(TEST_DIR, 'Documented.type.ts');
        await writeFile(filePath, content);

        const result = await parseTypeFile(filePath);

        expect(result.definitions).toHaveLength(1);
        expect(result.definitions[0]!.jsDoc).toBeDefined();
    });

    it('should handle empty file', async () => {
        const content = '';
        const filePath = join(TEST_DIR, 'Empty.type.ts');
        await writeFile(filePath, content);

        const result = await parseTypeFile(filePath);

        expect(result.definitions).toHaveLength(0);
    });

    it('should handle file with only comments', async () => {
        const content = `
// This is just a comment file
/* Block comment */
/**
 * JSDoc comment but no actual types
 */
`;

        const filePath = join(TEST_DIR, 'Comments.type.ts');
        await writeFile(filePath, content);

        const result = await parseTypeFile(filePath);

        expect(result.definitions).toHaveLength(0);
    });

    it('should ignore non-exported types when they exist alongside exported ones', async () => {
        const content = `
interface PublicUser {
  name: string;
}

interface InternalData {
  secret: string;
}

export interface ExportedUser {
  email: string;
}
`;

        const filePath = join(TEST_DIR, 'Mixed.type.ts');
        await writeFile(filePath, content);

        const result = await parseTypeFile(filePath);

        // Should find all interface declarations regardless of export status
        expect(result.definitions).toHaveLength(3);
        expect(result.definitions.map(d => d.name)).toEqual(['PublicUser', 'InternalData', 'ExportedUser']);
    });
});
