import { expect, test } from 'bun:test';

import { formatMarkdown } from './formatMarkdown.js';

test('formats ambiguous markdown idempotently without unnecessary escapes', () => {
    const source = [
        '- **@/\\* import resolution**: Handles `@/*` imports correctly',
        '',
        '![](https://example.com/image.png?table=block&id=123&signature=abc)',
        '',
        '**Example Query: **',
        '',
        'curl --request GET \\',
        "--url '{{BASE_URL}}/v3/order/{{order_id}}/result/pdf' \\",
        "--header 'accept: application/json'",
        '',
        '[OLH - API TRT.postman_collection.json](./assets/OLH - API TRT.postman_collection.json)',
        '',
        '- **support@clientdomain.com**** - contact support',
        '  or \\*\\*',
        '',
    ].join('\n');

    const firstPass = formatMarkdown(source);

    expect(formatMarkdown(firstPass)).toBe(firstPass);
    expect(firstPass).toContain('**@/\\* import resolution**');
    expect(firstPass).not.toContain('\\&');
    expect(firstPass).not.toContain('\\--url');
    expect(firstPass).not.toContain(']\\(');
    expect(firstPass).not.toContain('\\*\\*Example Query');
});

test('keeps links whose text equals their destination but only unwraps literal autolinks', () => {
    const source = [
        'See [README.md](README.md), [docs/foo.md](docs/foo.md) and [#anchor](#anchor).',
        '',
        'Autolinks: [http://localhost:6006](http://localhost:6006), [a@b.com](mailto:a@b.com)',
        'and [www.foo.com](http://www.foo.com).',
        '',
    ].join('\n');

    const firstPass = formatMarkdown(source);

    expect(formatMarkdown(firstPass)).toBe(firstPass);
    expect(firstPass).toContain('[README.md](README.md)');
    expect(firstPass).toContain('[docs/foo.md](docs/foo.md)');
    expect(firstPass).toContain('[#anchor](#anchor)');
    expect(firstPass).toContain('Autolinks: http://localhost:6006, a@b.com');
    expect(firstPass).toContain('and www.foo.com.');
});
