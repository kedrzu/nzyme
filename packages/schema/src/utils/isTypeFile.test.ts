import { describe, expect, it } from 'vitest';

import { isTypeFile } from './isTypeFile.js';

describe('isTypeFile', () => {
    it('should identify type files correctly', () => {
        expect(isTypeFile('User.type.ts')).toBe(true);
        expect(isTypeFile('Component.type.ts')).toBe(true);
        expect(isTypeFile('User.ts')).toBe(false);
        expect(isTypeFile('User.schema.ts')).toBe(false);
        expect(isTypeFile('test.js')).toBe(false);
    });
});
