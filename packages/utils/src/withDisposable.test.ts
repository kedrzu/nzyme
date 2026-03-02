import { expect, test } from 'bun:test';

import { withDisposable } from './withDisposable.js';

test('should add dispose method to object', () => {
    const obj = {};
    let disposed = false;

    const disposable = withDisposable(obj, () => {
        disposed = true;
    });

    expect(disposable).toBe(obj);
    expect(disposed).toBe(false);

    disposable[Symbol.dispose]();

    expect(disposed).toBe(true);
});

test('should chain existing dispose method', () => {
    let originalDisposed = false;
    let newDisposed = false;

    const obj = {
        [Symbol.dispose]() {
            originalDisposed = true;
        },
    };

    const disposable = withDisposable(obj, () => {
        newDisposed = true;
    });

    disposable[Symbol.dispose]();

    expect(originalDisposed).toBe(true);
    expect(newDisposed).toBe(true);
});

test('should work with using statement', () => {
    let disposed = false;

    {
        using _ = withDisposable({}, () => {
            disposed = true;
        });
    }

    expect(disposed).toBe(true);
});

test('should preserve this context in original dispose', () => {
    class Resource implements Disposable {
        public disposed = false;

        [Symbol.dispose]() {
            this.disposed = true;
        }
    }

    const resource = new Resource();

    withDisposable(resource, () => {});

    // This should not throw and should correctly set disposed to true
    (resource as Disposable)[Symbol.dispose]();

    expect(resource.disposed).toBe(true);
});
