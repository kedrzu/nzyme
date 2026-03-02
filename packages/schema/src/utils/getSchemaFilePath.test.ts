import { describe, expect, it } from 'bun:test';

import { getSchemaFilePath } from './getSchemaFilePath.js';

describe('getSchemaFilePath', () => {
    it('should generate correct schema file paths', () => {
        expect(getSchemaFilePath('User.type.ts')).toBe('User.schema.ts');
        expect(getSchemaFilePath('/path/to/User.type.ts')).toBe('/path/to/User.schema.ts');
        expect(getSchemaFilePath('User.type.ts', '/output')).toBe('/output/User.schema.ts');
    });
});
