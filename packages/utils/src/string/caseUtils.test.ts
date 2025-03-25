import { describe, expect, it } from 'vitest';

import { toCamelCase, toKebabCase, toPascalCase, toSnakeCase, toTitleCase } from './caseUtils.js';

describe('toCamelCase', () => {
    it('should convert space-separated words to camelCase', () => {
        expect(toCamelCase('hello world')).toBe('helloWorld');
        expect(toCamelCase('hello world example')).toBe('helloWorldExample');
    });

    it('should convert hyphen-separated words to camelCase', () => {
        expect(toCamelCase('hello-world')).toBe('helloWorld');
        expect(toCamelCase('hello-world-example')).toBe('helloWorldExample');
    });

    it('should convert underscore-separated words to camelCase', () => {
        expect(toCamelCase('hello_world')).toBe('helloWorld');
        expect(toCamelCase('hello_world_example')).toBe('helloWorldExample');
    });

    it('should handle mixed separators', () => {
        expect(toCamelCase('hello-world_example')).toBe('helloWorldExample');
        expect(toCamelCase('hello_world-example')).toBe('helloWorldExample');
    });

    it('should handle PascalCase input', () => {
        expect(toCamelCase('HelloWorld')).toBe('helloWorld');
        expect(toCamelCase('HelloWorldExample')).toBe('helloWorldExample');
    });

    it('should handle empty string', () => {
        expect(toCamelCase('')).toBe('');
    });

    it('should handle single word', () => {
        expect(toCamelCase('hello')).toBe('hello');
        expect(toCamelCase('Hello')).toBe('hello');
    });

    it('should handle all-caps input', () => {
        expect(toCamelCase('HELLO')).toBe('hello');
        expect(toCamelCase('HELLO WORLD')).toBe('helloWorld');
        expect(toCamelCase('HELLO_WORLD_EXAMPLE')).toBe('helloWorldExample');
    });
});

describe('toPascalCase', () => {
    it('should convert space-separated words to PascalCase', () => {
        expect(toPascalCase('hello world')).toBe('HelloWorld');
        expect(toPascalCase('hello world example')).toBe('HelloWorldExample');
    });

    it('should convert hyphen-separated words to PascalCase', () => {
        expect(toPascalCase('hello-world')).toBe('HelloWorld');
        expect(toPascalCase('hello-world-example')).toBe('HelloWorldExample');
    });

    it('should convert underscore-separated words to PascalCase', () => {
        expect(toPascalCase('hello_world')).toBe('HelloWorld');
        expect(toPascalCase('hello_world_example')).toBe('HelloWorldExample');
    });

    it('should handle mixed separators', () => {
        expect(toPascalCase('hello-world_example')).toBe('HelloWorldExample');
        expect(toPascalCase('hello_world-example')).toBe('HelloWorldExample');
    });

    it('should handle camelCase input', () => {
        expect(toPascalCase('helloWorld')).toBe('HelloWorld');
        expect(toPascalCase('helloWorldExample')).toBe('HelloWorldExample');
    });

    it('should handle empty string', () => {
        expect(toPascalCase('')).toBe('');
    });

    it('should handle single word', () => {
        expect(toPascalCase('hello')).toBe('Hello');
        expect(toPascalCase('Hello')).toBe('Hello');
    });

    it('should handle all-caps input', () => {
        expect(toPascalCase('HELLO')).toBe('Hello');
        expect(toPascalCase('HELLO WORLD')).toBe('HelloWorld');
        expect(toPascalCase('HELLO_WORLD_EXAMPLE')).toBe('HelloWorldExample');
    });
});

describe('toTitleCase', () => {
    it('should convert space-separated words to Title Case', () => {
        expect(toTitleCase('hello world')).toBe('Hello World');
        expect(toTitleCase('hello world example')).toBe('Hello World Example');
    });

    it('should convert hyphen-separated words to Title Case', () => {
        expect(toTitleCase('hello-world')).toBe('Hello World');
        expect(toTitleCase('hello-world-example')).toBe('Hello World Example');
    });

    it('should convert underscore-separated words to Title Case', () => {
        expect(toTitleCase('hello_world')).toBe('Hello World');
        expect(toTitleCase('hello_world_example')).toBe('Hello World Example');
    });

    it('should handle mixed separators', () => {
        expect(toTitleCase('hello-world_example')).toBe('Hello World Example');
        expect(toTitleCase('hello_world-example')).toBe('Hello World Example');
    });

    it('should handle camelCase input', () => {
        expect(toTitleCase('helloWorld')).toBe('Hello World');
        expect(toTitleCase('helloWorldExample')).toBe('Hello World Example');
    });

    it('should handle empty string', () => {
        expect(toTitleCase('')).toBe('');
    });

    it('should handle single word', () => {
        expect(toTitleCase('hello')).toBe('Hello');
        expect(toTitleCase('Hello')).toBe('Hello');
    });

    it('should handle all-caps input', () => {
        expect(toTitleCase('HELLO')).toBe('Hello');
        expect(toTitleCase('HELLO WORLD')).toBe('Hello World');
        expect(toTitleCase('HELLO_WORLD_EXAMPLE')).toBe('Hello World Example');
    });
});

describe('toSnakeCase', () => {
    it('should convert space-separated words to snake_case', () => {
        expect(toSnakeCase('hello world')).toBe('hello_world');
        expect(toSnakeCase('hello world example')).toBe('hello_world_example');
    });

    it('should convert hyphen-separated words to snake_case', () => {
        expect(toSnakeCase('hello-world')).toBe('hello_world');
        expect(toSnakeCase('hello-world-example')).toBe('hello_world_example');
    });

    it('should handle mixed separators', () => {
        expect(toSnakeCase('hello-world_example')).toBe('hello_world_example');
        expect(toSnakeCase('hello_world-example')).toBe('hello_world_example');
    });

    it('should handle camelCase input', () => {
        expect(toSnakeCase('helloWorld')).toBe('hello_world');
        expect(toSnakeCase('helloWorldExample')).toBe('hello_world_example');
    });

    it('should handle PascalCase input', () => {
        expect(toSnakeCase('HelloWorld')).toBe('hello_world');
        expect(toSnakeCase('HelloWorldExample')).toBe('hello_world_example');
    });

    it('should handle empty string', () => {
        expect(toSnakeCase('')).toBe('');
    });

    it('should handle single word', () => {
        expect(toSnakeCase('hello')).toBe('hello');
        expect(toSnakeCase('Hello')).toBe('hello');
    });

    it('should handle all-caps input', () => {
        expect(toSnakeCase('HELLO')).toBe('hello');
        expect(toSnakeCase('HELLO WORLD')).toBe('hello_world');
        expect(toSnakeCase('HELLO_WORLD_EXAMPLE')).toBe('hello_world_example');
    });
});

describe('toKebabCase', () => {
    it('should convert space-separated words to kebab-case', () => {
        expect(toKebabCase('hello world')).toBe('hello-world');
        expect(toKebabCase('hello world example')).toBe('hello-world-example');
    });

    it('should convert underscore-separated words to kebab-case', () => {
        expect(toKebabCase('hello_world')).toBe('hello-world');
        expect(toKebabCase('hello_world_example')).toBe('hello-world-example');
    });

    it('should handle mixed separators', () => {
        expect(toKebabCase('hello-world_example')).toBe('hello-world-example');
        expect(toKebabCase('hello_world-example')).toBe('hello-world-example');
    });

    it('should handle camelCase input', () => {
        expect(toKebabCase('helloWorld')).toBe('hello-world');
        expect(toKebabCase('helloWorldExample')).toBe('hello-world-example');
    });

    it('should handle PascalCase input', () => {
        expect(toKebabCase('HelloWorld')).toBe('hello-world');
        expect(toKebabCase('HelloWorldExample')).toBe('hello-world-example');
    });

    it('should handle empty string', () => {
        expect(toKebabCase('')).toBe('');
    });

    it('should handle single word', () => {
        expect(toKebabCase('hello')).toBe('hello');
        expect(toKebabCase('Hello')).toBe('hello');
    });

    it('should handle all-caps input', () => {
        expect(toKebabCase('HELLO')).toBe('hello');
        expect(toKebabCase('HELLO WORLD')).toBe('hello-world');
        expect(toKebabCase('HELLO_WORLD_EXAMPLE')).toBe('hello-world-example');
    });
});
