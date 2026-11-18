import { expect, test } from 'bun:test';

import { fingerprintFile } from './fingerprintFile.js';

const base = `
import { formatName } from './formatName.js';
import type { User } from './User.js';

export const LIMIT = 10;

export function greet(user: User): string {
    return 'Hello ' + formatName(user);
}

export const handler = defineHandler({
    limit: LIMIT,
    run(user: User) {
        const inner = () => greet(user);
        return inner();
    },
});
`;

test('a change to types or comments only changes no hash', () => {
    const after = `
// A leading comment.
import { formatName } from './formatName.js';
import type { User, Admin } from './User.js';
import { type Role } from './Role.js';

export const LIMIT: number = 10;

interface Options { verbose: boolean }

/** Greets a user. */
export function greet(user: User | Admin | Options): string {
    // Formatting changes too.
    return 'Hello ' +
        formatName(user as User);
}

export const handler = defineHandler({
    limit: LIMIT,
    run(user: User): string {
        const inner = (): string => greet(user);
        return inner();
    },
});
`;
    expect(changedParts('handler.ts', base, after)).toEqual([]);
});

test('a change inside a function body changes only body', () => {
    expect(changedParts('handler.ts', base, base.replace("'Hello '", "'Hi '"))).toEqual(['body']);
});

test('a change inside a nested function changes only body', () => {
    expect(changedParts('handler.ts', base, base.replace('greet(user)', 'greet(user) + 1'))).toEqual(['body']);
});

test('a change to top-level code changes only top', () => {
    expect(changedParts('handler.ts', base, base.replace('LIMIT = 10', 'LIMIT = 20'))).toEqual(['top']);
});

test('a new import changes top', () => {
    const after = base
        .replace(
            "import type { User } from './User.js';",
            "import type { User } from './User.js';\nimport { audit } from './audit.js';",
        )
        .replace('limit: LIMIT,', 'limit: LIMIT,\n    audit,');
    expect(changedParts('handler.ts', base, after)).toEqual(['top']);
});

test('a new side-effect import changes top', () => {
    expect(changedParts('handler.ts', base, `import './polyfill.js';\n${base}`)).toEqual(['top']);
});

test('the body of a function invoked in place runs at load, so it is top', () => {
    const before = `enum Status { Active = 'active' }\n(() => { register(Status); })();\nexport function f() { return 1; }`;
    expect(changedParts('status.ts', before, before.replace("'active'", "'enabled'"))).toEqual(['top']);
    expect(changedParts('status.ts', before, before.replace('register(Status)', 'register(Status, 1)'))).toEqual([
        'top',
    ]);
});

test('a file that does not parse is whole', () => {
    expect(fingerprintFile('handler.ts', 'export const = ;')).toBe('whole');
    expect(fingerprintFile('handler.js', 'const x: number = 1;')).toBe('whole');
});

test('TSX and JS modules are split like TS', () => {
    const tsx = `export const Card = (props: { title: string }) => <div class="card">{props.title}</div>;\nexport const size = 1;`;
    expect(changedParts('Card.tsx', tsx, tsx.replace('"card"', '"panel"'))).toEqual(['body']);

    const js = `import { b } from './b.js';\nexport function a() { return b; }`;
    expect(changedParts('a.mjs', js, js.replace('return b', 'return b + 1'))).toEqual(['body']);
    expect(changedParts('a.mjs', js, `import { c } from './c.js';\n${js}`)).toEqual(['top']);
});

test('a stylesheet ignores formatting, and any other change changes both hashes', () => {
    const scss = `$gap: 4px;\n.card {\n    margin: $gap;\n}\n`;
    expect(changedParts('card.scss', scss, '$gap: 4px; .card { margin: $gap; }')).toEqual([]);
    expect(changedParts('card.scss', scss, scss.replace('4px', '8px'))).toEqual(['body', 'top']);
});

test('a non-script file is whole', () => {
    expect(fingerprintFile('logo.png', 'PNG')).toBe('whole');
    expect(fingerprintFile('config.json', '{}')).toBe('whole');
});

/** Which parts of the fingerprint differ between two versions of a file; `whole` if either is unsplit. */
function changedParts(path: string, before: string, after: string) {
    const a = fingerprintFile(path, before);
    const b = fingerprintFile(path, after);
    if (a === 'whole' || b === 'whole') {
        return ['whole'];
    }

    const parts: string[] = [];
    if (a.body !== b.body) {
        parts.push('body');
    }
    if (a.top !== b.top) {
        parts.push('top');
    }
    return parts;
}
