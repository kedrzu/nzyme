import { expect, test } from 'vitest';

import { withDisposableAsync } from './withDisposableAsync.js';

test('should add async dispose method to object', async () => {
    const obj = {};
    let disposed = false;

    const disposable = withDisposableAsync(obj, async () => {
        disposed = true;
        await Promise.resolve();
    });

    expect(disposable).toBe(obj);
    expect(disposed).toBe(false);

    await disposable[Symbol.asyncDispose]();

    expect(disposed).toBe(true);
});

test('should chain existing async dispose method', async () => {
    let originalDisposed = false;
    let newDisposed = false;

    const obj = {
        async [Symbol.asyncDispose]() {
            originalDisposed = true;
            await Promise.resolve();
        },
    };

    const disposable = withDisposableAsync(obj, async () => {
        newDisposed = true;
        await Promise.resolve();
    });

    await disposable[Symbol.asyncDispose]();

    expect(originalDisposed).toBe(true);
    expect(newDisposed).toBe(true);
});

test('should work with await using statement', async () => {
    let disposed = false;

    {
        await using _ = withDisposableAsync({}, async () => {
            disposed = true;
            await Promise.resolve();
        });
    }

    expect(disposed).toBe(true);
});

test('should preserve this context in original async dispose', async () => {
    class Resource implements AsyncDisposable {
        public disposed = false;

        async [Symbol.asyncDispose]() {
            this.disposed = true;
            await Promise.resolve();
        }
    }

    const resource = new Resource();

    withDisposableAsync(resource, async () => {});

    // This should not throw and should correctly set disposed to true
    await (resource as AsyncDisposable)[Symbol.asyncDispose]();

    expect(resource.disposed).toBe(true);
});
