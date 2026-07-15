import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { expect, test } from 'bun:test';

const CLI_PATH = new URL('../cli.ts', import.meta.url).pathname;

test('formats ambiguous markdown idempotently without unnecessary escapes', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'format-markdown-'));
    const file = path.join(directory, 'fixture.md');
    await fs.writeFile(
        file,
        [
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
        ].join('\n'),
    );

    expect(await runFormatMarkdown(file)).toBe(0);
    const firstPass = await fs.readFile(file, 'utf8');

    expect(await runFormatMarkdown(file)).toBe(0);
    const secondPass = await fs.readFile(file, 'utf8');

    expect(secondPass).toBe(firstPass);
    expect(firstPass).toContain('**@/\\* import resolution**');
    expect(firstPass).not.toContain('\\&');
    expect(firstPass).not.toContain('\\--url');
    expect(firstPass).not.toContain(']\\(');
    expect(firstPass).not.toContain('\\*\\*Example Query');
});

function runFormatMarkdown(file: string): Promise<number> {
    const child = Bun.spawn([process.execPath, '--conditions=source', CLI_PATH, 'format-markdown', file], {
        cwd: path.dirname(CLI_PATH),
        stdout: 'ignore',
        stderr: 'ignore',
    });
    return child.exited;
}
