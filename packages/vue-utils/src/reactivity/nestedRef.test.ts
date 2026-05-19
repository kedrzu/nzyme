import { expect, test } from 'bun:test';
import { readonly, ref } from 'vue';

import { nestedRef } from './nestedRef.js';

test('creates writable nested ref from writable parent ref', () => {
    const parent = ref({ name: 'John', age: 30 });
    const name = nestedRef(parent, 'name');

    expect(name.value).toBe('John');
});

test('creates readonly nested ref from readonly parent ref', () => {
    const parent = readonly(ref({ name: 'John', age: 30 }));
    const name = nestedRef(parent, 'name');

    expect(name.value).toBe('John');
});

test('nested ref updates when parent ref property changes', () => {
    const parent = ref({ name: 'John', age: 30 });
    const name = nestedRef(parent, 'name');

    expect(name.value).toBe('John');

    parent.value.name = 'Jane';

    expect(name.value).toBe('Jane');
});

test('parent ref updates when writable nested ref changes', () => {
    const parent = ref({ name: 'John', age: 30 });
    const name = nestedRef(parent, 'name');

    name.value = 'Jane';

    expect(parent.value.name).toBe('Jane');
});

test('nested ref updates when entire parent value is replaced', () => {
    const parent = ref({ name: 'John', age: 30 });
    const name = nestedRef(parent, 'name');

    parent.value = { name: 'Jane', age: 25 };

    expect(name.value).toBe('Jane');
});

test('works with numeric properties', () => {
    const parent = ref({ count: 0, total: 100 });
    const count = nestedRef(parent, 'count');

    expect(count.value).toBe(0);

    count.value = 42;

    expect(parent.value.count).toBe(42);
    expect(count.value).toBe(42);
});

test('works with boolean properties', () => {
    const parent = ref({ active: true, disabled: false });
    const active = nestedRef(parent, 'active');

    expect(active.value).toBe(true);

    active.value = false;

    expect(parent.value.active).toBe(false);
    expect(active.value).toBe(false);
});

test('works with object properties', () => {
    interface User {
        profile: { email: string; verified: boolean };
        settings: { theme: string };
    }

    const parent = ref<User>({
        profile: { email: 'john@example.com', verified: false },
        settings: { theme: 'dark' },
    });
    const profile = nestedRef(parent, 'profile');

    expect(profile.value).toEqual({ email: 'john@example.com', verified: false });

    profile.value = { email: 'jane@example.com', verified: true };

    expect(parent.value.profile).toEqual({ email: 'jane@example.com', verified: true });
});

test('works with array properties', () => {
    const parent = ref({ items: [1, 2, 3], tags: ['a', 'b'] });
    const items = nestedRef(parent, 'items');

    expect(items.value).toEqual([1, 2, 3]);

    items.value = [4, 5, 6];

    expect(parent.value.items).toEqual([4, 5, 6]);
});

test('works with null values', () => {
    const parent = ref<{ value: string | null }>({ value: null });
    const value = nestedRef(parent, 'value');

    expect(value.value).toBeNull();

    value.value = 'test';

    expect(parent.value.value).toBe('test');

    value.value = null;

    expect(parent.value.value).toBeNull();
});

test('works with undefined values', () => {
    const parent = ref<{ value?: string }>({ value: undefined });
    const value = nestedRef(parent, 'value');

    expect(value.value).toBeUndefined();

    value.value = 'test';

    expect(parent.value.value).toBe('test');
});

test('works with empty string', () => {
    const parent = ref({ text: '' });
    const text = nestedRef(parent, 'text');

    expect(text.value).toBe('');

    text.value = 'hello';

    expect(parent.value.text).toBe('hello');

    text.value = '';

    expect(parent.value.text).toBe('');
});

test('works with zero value', () => {
    const parent = ref({ count: 0 });
    const count = nestedRef(parent, 'count');

    expect(count.value).toBe(0);

    count.value = 42;

    expect(parent.value.count).toBe(42);

    count.value = 0;

    expect(parent.value.count).toBe(0);
});

test('multiple nested refs from same parent work independently', () => {
    const parent = ref({ name: 'John', age: 30, city: 'NYC' });
    const name = nestedRef(parent, 'name');
    const age = nestedRef(parent, 'age');
    const city = nestedRef(parent, 'city');

    expect(name.value).toBe('John');
    expect(age.value).toBe(30);
    expect(city.value).toBe('NYC');

    name.value = 'Jane';

    expect(name.value).toBe('Jane');
    expect(age.value).toBe(30);
    expect(city.value).toBe('NYC');
    expect(parent.value).toEqual({ name: 'Jane', age: 30, city: 'NYC' });
});

test('readonly nested ref cannot be modified', () => {
    const parent = readonly(ref({ name: 'John', age: 30 }));
    const name = nestedRef(parent, 'name');

    expect(name.value).toBe('John');

    // Vue logs a warning but doesn't throw, and the value doesn't change
    name.value = 'Jane';

    // Value should remain unchanged
    expect(name.value).toBe('John');
    expect(parent.value.name).toBe('John');
});

test('nested ref reflects changes to nested objects within parent', () => {
    interface Data {
        nested: { value: string };
    }

    const parent = ref<Data>({ nested: { value: 'initial' } });
    const nested = nestedRef(parent, 'nested');

    expect(nested.value.value).toBe('initial');

    parent.value.nested.value = 'updated';

    expect(nested.value.value).toBe('updated');

    nested.value = { value: 'changed' };

    expect(parent.value.nested.value).toBe('changed');
});

test('handles complex nested structures', () => {
    interface ComplexData {
        user: {
            profile: {
                name: string;
                contacts: string[];
            };
            settings: {
                notifications: boolean;
            };
        };
    }

    const parent = ref<ComplexData>({
        user: {
            profile: {
                name: 'John',
                contacts: ['email@example.com'],
            },
            settings: {
                notifications: true,
            },
        },
    });

    const user = nestedRef(parent, 'user');

    expect(user.value.profile.name).toBe('John');
    expect(user.value.settings.notifications).toBe(true);

    user.value = {
        profile: {
            name: 'Jane',
            contacts: ['jane@example.com', 'jane2@example.com'],
        },
        settings: {
            notifications: false,
        },
    };

    expect(parent.value.user.profile.name).toBe('Jane');
    expect(parent.value.user.profile.contacts).toEqual(['jane@example.com', 'jane2@example.com']);
    expect(parent.value.user.settings.notifications).toBe(false);
});

test('works with symbol keys', () => {
    const symbolKey = Symbol('test');
    const parent = ref({ [symbolKey]: 'value' });
    const nested = nestedRef(parent, symbolKey);

    expect(nested.value).toBe('value');

    nested.value = 'updated';

    expect(parent.value[symbolKey]).toBe('updated');
});

test('works with number keys', () => {
    const parent = ref({ 0: 'first', 1: 'second' } as { [key: number]: string });
    const first = nestedRef(parent, 0);

    expect(first.value).toBe('first');

    first.value = 'updated';

    expect(parent.value[0]).toBe('updated');
});
