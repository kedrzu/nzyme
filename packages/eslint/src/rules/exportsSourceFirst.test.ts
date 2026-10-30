import { RuleTester } from 'eslint';
import * as jsoncParser from 'jsonc-eslint-parser';
import { describe, it } from 'bun:test';

import { exportsSourceFirst } from './exportsSourceFirst.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
    languageOptions: { parser: jsoncParser },
});

function pkg(exports: string): string {
    return `{\n    "name": "x",\n    "exports": ${exports}\n}\n`;
}

tester.run('exports-source-first', exportsSourceFirst, {
    valid: [
        {
            name: 'source after types',
            code: pkg(
                `{ ".": { "types": "./dist/index.d.ts", "source": "./src/index.ts", "import": "./dist/index.js" } }`,
            ),
        },
        {
            name: 'source first without types',
            code: pkg(`{ ".": { "source": "./src/index.ts", "default": "./dist/index.js" } }`),
        },
        {
            name: 'source first even when types comes later',
            code: pkg(
                `{ ".": { "source": "./src/index.ts", "import": "./dist/index.js", "types": "./dist/index.d.ts" } }`,
            ),
        },
        {
            name: 'every condition already points at src',
            code: pkg(`{ ".": { "types": "./src/index.ts", "default": "./src/index.ts" } }`),
        },
        {
            name: 'nested conditions are checked at their own level',
            code: pkg(
                `{ ".": { "node": { "types": "./dist/a.d.ts", "source": "./src/a.ts", "default": "./dist/a.js" }, "default": { "source": "./src/b.ts", "default": "./dist/b.js" } } }`,
            ),
        },
        {
            name: 'string exports are not conditions',
            code: pkg(`"./dist/index.js"`),
        },
        {
            name: 'only types points into dist',
            code: pkg(`{ ".": { "types": "./dist/index.d.ts", "default": "./src/index.ts" } }`),
        },
        {
            name: 'objects outside exports are ignored',
            code: `{ "publishConfig": { "import": "./dist/index.js" } }`,
        },
    ],
    invalid: [
        {
            name: 'source after import is moved up',
            code: pkg(
                `{\n        ".": {\n            "types": "./dist/index.d.ts",\n            "import": "./dist/index.js",\n            "source": "./src/index.ts",\n            "default": "./dist/index.js"\n        }\n    }`,
            ),
            output: pkg(
                `{\n        ".": {\n            "types": "./dist/index.d.ts",\n            "source": "./src/index.ts",\n            "import": "./dist/index.js",\n            "default": "./dist/index.js"\n        }\n    }`,
            ),
            errors: [{ messageId: 'misplaced' }],
        },
        {
            name: 'source last without types is moved to the front',
            code: pkg(`{ ".": { "default": "./dist/index.js", "source": "./src/index.ts" } }`),
            output: pkg(`{ ".": { "source": "./src/index.ts", "default": "./dist/index.js" } }`),
            errors: [{ messageId: 'misplaced' }],
        },
        {
            name: 'types after the runtime conditions pulls source to the front',
            code: pkg(
                `{ ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts", "source": "./src/index.ts" } }`,
            ),
            output: pkg(
                `{ ".": { "source": "./src/index.ts", "import": "./dist/index.js", "types": "./dist/index.d.ts" } }`,
            ),
            errors: [{ messageId: 'misplaced' }],
        },
        {
            name: 'missing source is reported without a fix',
            code: pkg(`{ ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }`),
            output: null,
            errors: [{ messageId: 'missing' }],
        },
        {
            name: 'missing source in a nested conditions object',
            code: pkg(`{ ".": { "node": { "types": "./dist/a.d.ts", "default": "./dist/a.js" } } }`),
            output: null,
            errors: [{ messageId: 'missing' }],
        },
        {
            name: 'a source wildcard subpath is checked too',
            code: pkg(`{ "./*.js": { "import": "./dist/*.js", "source": "./src/*.ts" } }`),
            output: pkg(`{ "./*.js": { "source": "./src/*.ts", "import": "./dist/*.js" } }`),
            errors: [{ messageId: 'misplaced' }],
        },
    ],
});
