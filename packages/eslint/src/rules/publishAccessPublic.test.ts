import { RuleTester } from 'eslint';
import * as jsoncParser from 'jsonc-eslint-parser';
import { describe, it } from 'bun:test';

import { publishAccessPublic } from './publishAccessPublic.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
    languageOptions: { parser: jsoncParser },
});

tester.run('publish-access-public', publishAccessPublic, {
    valid: [
        { name: 'public access', code: `{ "publishConfig": { "access": "public" } }` },
        {
            name: 'private packages are skipped',
            code: `{ "private": true, "publishConfig": { "access": "restricted" } }`,
        },
        { name: 'private packages without publishConfig are skipped', code: `{ "private": true }` },
        { name: 'a missing publishConfig is left to require-publishConfig', code: `{ "name": "x" }` },
    ],
    invalid: [
        {
            name: 'restricted access',
            code: `{ "publishConfig": { "access": "restricted" } }`,
            errors: [{ messageId: 'notPublic' }],
        },
        {
            name: 'publishConfig without access',
            code: `{ "publishConfig": { "registry": "https://example.com" } }`,
            errors: [{ messageId: 'missing' }],
        },
        {
            name: 'private: false is still published',
            code: `{ "private": false, "publishConfig": { "access": "restricted" } }`,
            errors: [{ messageId: 'notPublic' }],
        },
    ],
});
