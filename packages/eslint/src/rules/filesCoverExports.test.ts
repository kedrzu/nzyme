import { RuleTester } from 'eslint';
import * as jsoncParser from 'jsonc-eslint-parser';
import { describe, it } from 'bun:test';

import { filesCoverExports } from './filesCoverExports.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
    languageOptions: { parser: jsoncParser },
});

tester.run('files-cover-exports', filesCoverExports, {
    valid: [
        {
            name: 'dist covers the exports, main and types targets',
            code: `{ "files": ["dist"], "main": "./dist/index.js", "types": "./dist/index.d.ts", "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } } }`,
        },
        {
            name: 'source condition targets may live outside files',
            code: `{ "files": ["dist"], "exports": { ".": { "types": "./dist/index.d.ts", "source": "./src/index.ts", "import": "./dist/index.js" } } }`,
        },
        {
            name: 'wildcard targets are covered by their directory',
            code: `{ "files": ["dist"], "exports": { "./*.js": { "source": "./src/*.ts", "import": "./dist/*.js" } } }`,
        },
        {
            name: 'packages that ship src list it',
            code: `{ "files": ["src"], "exports": { ".": "./src/index.ts" } }`,
        },
        {
            name: 'a files entry may be a single file or a glob',
            code: `{ "files": ["dist/index.js", "types/*.d.ts"], "main": "./dist/index.js", "types": "./types/index.d.ts" }`,
        },
        {
            name: 'a `**/` glob matches zero directories',
            code: `{ "files": ["dist/**/*.js"], "main": "./dist/index.js" }`,
        },
        {
            name: 'package.json is always shipped',
            code: `{ "files": ["dist"], "exports": { "./package.json": "./package.json" } }`,
        },
        {
            name: 'no files means npm ships everything',
            code: `{ "main": "./dist/index.js" }`,
        },
        {
            name: 'private packages are never flagged',
            code: `{ "private": true, "files": ["dist"], "main": "./lib/index.js" }`,
        },
    ],
    invalid: [
        {
            name: 'exports target outside files',
            code: `{ "files": ["dist"], "exports": { ".": { "import": "./lib/index.js" } } }`,
            errors: [{ messageId: 'notShipped', data: { target: './lib/index.js', suggestion: 'lib' } }],
        },
        {
            name: 'main outside files',
            code: `{ "files": ["dist"], "main": "./src/index.js" }`,
            errors: [{ messageId: 'notShipped' }],
        },
        {
            name: 'types outside files',
            code: `{ "files": ["dist"], "types": "./types/index.d.ts" }`,
            errors: [{ messageId: 'notShipped' }],
        },
        {
            name: 'only the uncovered targets are reported',
            code: `{ "files": ["dist"], "exports": { ".": { "types": "./types/a.d.ts", "import": "./dist/a.js", "default": "./cjs/a.js" } } }`,
            errors: [{ messageId: 'notShipped' }, { messageId: 'notShipped' }],
        },
        {
            name: 'a negated files entry does not cover anything',
            code: `{ "files": ["!dist"], "main": "./dist/index.js" }`,
            errors: [{ messageId: 'notShipped' }],
        },
        {
            name: 'a nested source condition is exempt but its siblings are not',
            code: `{ "files": ["dist"], "exports": { ".": { "node": { "source": "./src/a.ts", "default": "./lib/a.js" } } } }`,
            errors: [{ messageId: 'notShipped' }],
        },
        {
            name: 'a source subpath key is not mistaken for the condition',
            code: `{ "files": ["dist"], "exports": { "./source": "./lib/source.js" } }`,
            errors: [{ messageId: 'notShipped' }],
        },
    ],
});
