# @nzyme/schema

A TypeScript library that parses TypeScript interface definitions and generates [sury](https://github.com/DZakh/sury) schemas from them.

## Features

- 🔄 **Parse TypeScript Files**: Automatically parse `.type.ts` files into AST
- 🛠️ **Transform to Sury Schemas**: Convert TypeScript types to properly typed sury schemas
- 📝 **JSDoc Support**: Extract descriptions and metadata from JSDoc comments
- 🎯 **Type Support**: Comprehensive support for primitives, arrays, objects, and unions
- ⚡ **Optional/Nullable**: Automatic handling of undefined and null as proper sury modifiers
- 📁 **File Generation**: Generate `.schema.ts` files with proper imports and exports

## Supported Types

- **Primitives**: `string`, `number`, `boolean`, `Date`, etc.
- **Arrays**: `T[]`, `Array<T>`, nested arrays
- **Objects**: interfaces, type literals, nested objects
- **Unions**: literal unions, optional (`T | undefined`), nullable (`T | null`)
- **Generic Types**: `Record<K, V>`, `Array<T>`, custom generics
- **Built-in Types**: `Date`, `Record`, `Array`

## Installation

```bash
yarn add @nzyme/schema
```

## Quick Start

### 1. Create a TypeScript Type File

Create a file with `.type.ts` extension:

```typescript
// User.type.ts

/**
 * User entity representing a system user
 * @since 1.0.0
 * @author Schema Generator
 */
interface User {
    /** Unique user identifier */
    id: number;

    /** User's full name */
    name: string;

    /** User's email address */
    email: string;

    /** User profile information */
    profile: {
        /** Profile picture URL */
        avatar?: string | null;
        /** User biography */
        bio?: string;
    };

    /** User roles in the system */
    roles: UserRole[];

    /** Account status */
    status: UserStatus;

    /** Additional metadata */
    metadata?: Record<string, unknown>;

    /** Account creation timestamp */
    createdAt: Date;
}

/**
 * User role enumeration
 */
type UserRole = 'admin' | 'moderator' | 'editor' | 'user' | 'guest';

/**
 * User account status
 */
type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';
```

### 2. Generate Schema

```typescript
import { generateSchemaFromFile } from '@nzyme/schema';

// Generate schema file
const result = await generateSchemaFromFile({
    inputPath: './User.type.ts',
});

console.log(`Generated ${result.count} schemas in ${result.outputPath}`);
```

### 3. Generated Output

This will create a `User.schema.ts` file:

```typescript
// This file was auto-generated. Do not edit manually.
// Generated from: User.type.ts

import * as s from 'sury';
import type { User, UserRole, UserStatus } from './User.type.js';

/**
 * User entity representing a system user
 * @since 1.0.0
 * @author Schema Generator
 */
export const UserSchema = s.object({
    id: s.number(),
    name: s.string(),
    email: s.string(),
    profile: s.object({
        avatar: s.optional(s.nullable(s.string())),
        bio: s.optional(s.string()),
    }),
    roles: s.array(UserRoleSchema),
    status: UserStatusSchema,
    metadata: s.optional(s.record(s.string(), s.unknown())),
    createdAt: s.date(),
});

// Type assertion to ensure schema matches the interface
export type UserInferred = s.infer<typeof UserSchema>;

/**
 * User role enumeration
 */
export const UserRoleSchema = s.union(
    s.literal('admin'),
    s.literal('moderator'),
    s.literal('editor'),
    s.literal('user'),
    s.literal('guest'),
);

// Type assertion to ensure schema matches the interface
export type UserRoleInferred = s.infer<typeof UserRoleSchema>;

/**
 * User account status
 */
export const UserStatusSchema = s.union(
    s.literal('active'),
    s.literal('inactive'),
    s.literal('suspended'),
    s.literal('pending'),
);

// Type assertion to ensure schema matches the interface
export type UserStatusInferred = s.infer<typeof UserStatusSchema>;
```

## API Reference

### `generateSchemaFromFile(options)`

Generate sury schemas from a TypeScript `.type.ts` file.

```typescript
interface GenerateSchemaFromFileOptions {
    /** Path to the input .type.ts file */
    inputPath: string;
    /** Optional output directory (defaults to same directory as input) */
    outputDir?: string;
    /** Custom output path (overrides outputDir) */
    outputPath?: string;
    /** Custom header comment to add to the generated file */
    headerComment?: string;
    /** Whether to include sury import (default: true) */
    includeSuryImport?: boolean;
}
```

### `generateSchemasFromFiles(filePaths, options)`

Generate schemas from multiple TypeScript files.

```typescript
const results = await generateSchemasFromFiles(
    ['./types/User.type.ts', './types/Product.type.ts', './types/Order.type.ts'],
    {
        outputDir: './schemas',
    },
);
```

### `parseTypeFileToSchemas(inputPath)`

Parse a TypeScript type file and return schema definitions without generating files.

```typescript
const schemas = await parseTypeFileToSchemas('./User.type.ts');
console.log(schemas); // Array of SchemaDefinition objects
```

### Utility Functions

```typescript
// Check if a file is a valid TypeScript type file
isTypeFile('User.type.ts'); // true
isTypeFile('User.ts'); // false

// Get the corresponding schema file path
getSchemaFilePath('User.type.ts'); // 'User.schema.ts'
getSchemaFilePath('User.type.ts', './schemas'); // './schemas/User.schema.ts'
```

## Advanced Usage

### Custom Output Configuration

```typescript
await generateSchemaFromFile({
    inputPath: './types/User.type.ts',
    outputPath: './generated/schemas/User.schema.ts',
    headerComment: 'Custom header for generated schema',
    includeSuryImport: true,
});
```

### Batch Processing

```typescript
import { glob } from 'glob';

// Find all .type.ts files
const typeFiles = await glob('./src/**/*.type.ts');

// Generate schemas for all files
const results = await generateSchemasFromFiles(typeFiles, {
    outputDir: './src/schemas',
});

console.log(`Generated ${results.length} schema files`);
```

### JSDoc Metadata

The library extracts JSDoc comments and tags:

```typescript
/**
 * User entity with comprehensive documentation
 * @since 1.0.0
 * @author John Doe
 * @deprecated Use UserV2 instead
 * @example { name: "John", age: 30 }
 */
interface User {
    name: string;
    age: number;
}
```

Generated schema will include:

- Description in JSDoc comment
- Metadata from tags (`@since`, `@author`, `@deprecated`, etc.)
- Proper TypeScript typing

## Type Transformations

### Primitives

```typescript
// TypeScript → Sury
string → s.string()
number → s.number()
boolean → s.boolean()
Date → s.date()
```

### Arrays

```typescript
string[] → s.array(s.string())
Array<number> → s.array(s.number())
number[][] → s.array(s.array(s.number()))
```

### Optional and Nullable

```typescript
name?: string → s.optional(s.string())
avatar: string | null → s.nullable(s.string())
data: string | undefined → s.optional(s.string())
```

### Unions

```typescript
'red' | 'green' | 'blue' → s.union(s.literal('red'), s.literal('green'), s.literal('blue'))
string | number → s.union(s.string(), s.number())
```

### Objects

```typescript
interface User {
  name: string;
  age: number;
}
→
s.object({
  name: s.string(),
  age: s.number()
})
```

### Generic Types

```typescript
Record<string, number> → s.record(s.string(), s.number())
Array<boolean> → s.array(s.boolean())
```

## Architecture

The library is structured in three main layers:

1. **AST Parsing** (`ast/parseTypeFile.ts`): Parses TypeScript files into AST nodes
2. **Schema Transformation** (`transform/astToSchema.ts`): Converts AST nodes to sury schema definitions
3. **Output Generation** (`output/generateSchemaFile.ts`): Creates `.schema.ts` files with proper formatting

## Development

```bash
# Install dependencies
yarn install

# Run tests
yarn test

# Build the package
yarn build

# Lint code
yarn lint
```

## License

MIT
