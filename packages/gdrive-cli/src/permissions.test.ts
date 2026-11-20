import { expect, test } from 'bun:test';

import { validatePermissions } from './permissions.js';

test('rejects unknown switches and non-boolean values', () => {
    expect(validatePermissions({ upload: true })).toEqual([]);
    expect(validatePermissions({ upload: 'yes', purge: true })).toEqual([
        "permissions: 'upload' must be true or false",
        "permissions: 'purge' is unknown (known: browse, download, upload, edit, delete)",
    ]);
    expect(validatePermissions([])).toHaveLength(1);
});
