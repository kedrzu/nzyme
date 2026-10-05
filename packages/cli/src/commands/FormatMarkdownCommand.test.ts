import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

test('keeps links whose text equals their destination but only unwraps literal autolinks', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'format-markdown-'));
    const file = path.join(directory, 'fixture.md');
    await fs.writeFile(
        file,
        [
            'See [README.md](README.md), [docs/foo.md](docs/foo.md) and [#anchor](#anchor).',
            '',
            'Autolinks: [http://localhost:6006](http://localhost:6006), [a@b.com](mailto:a@b.com)',
            'and [www.foo.com](http://www.foo.com).',
            '',
        ].join('\n'),
    );

    expect(await runFormatMarkdown(file)).toBe(0);
    const firstPass = await fs.readFile(file, 'utf8');

    expect(await runFormatMarkdown(file)).toBe(0);
    expect(await fs.readFile(file, 'utf8')).toBe(firstPass);

    expect(firstPass).toContain('[README.md](README.md)');
    expect(firstPass).toContain('[docs/foo.md](docs/foo.md)');
    expect(firstPass).toContain('[#anchor](#anchor)');
    expect(firstPass).toContain('Autolinks: http://localhost:6006, a@b.com');
    expect(firstPass).toContain('and www.foo.com.');
});

test('does not follow symlinks found while walking a directory but formats an explicitly passed symlink', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'format-markdown-'));
    const linkedDirectory = path.join(directory, 'linked');
    const walkedDirectory = path.join(directory, 'walked');
    const unformatted = '* item\n';
    await fs.mkdir(linkedDirectory);
    await fs.mkdir(walkedDirectory);
    await fs.writeFile(path.join(linkedDirectory, 'fixture.md'), unformatted);
    await fs.writeFile(path.join(walkedDirectory, 'plain.md'), unformatted);
    await fs.symlink(linkedDirectory, path.join(walkedDirectory, 'link-to-directory'));
    await fs.symlink(path.join(linkedDirectory, 'fixture.md'), path.join(walkedDirectory, 'link-to-file.md'));

    expect(await runFormatMarkdown(walkedDirectory)).toBe(0);
    expect(await fs.readFile(path.join(walkedDirectory, 'plain.md'), 'utf8')).not.toBe(unformatted);
    expect(await fs.readFile(path.join(linkedDirectory, 'fixture.md'), 'utf8')).toBe(unformatted);

    expect(await runFormatMarkdown(path.join(walkedDirectory, 'link-to-directory'))).toBe(0);
    expect(await fs.readFile(path.join(linkedDirectory, 'fixture.md'), 'utf8')).not.toBe(unformatted);
});

function runFormatMarkdown(file: string): Promise<number> {
    const child = Bun.spawn([process.execPath, '--conditions=source', CLI_PATH, 'format-markdown', file], {
        cwd: path.dirname(CLI_PATH),
        stdout: 'ignore',
        stderr: 'ignore',
    });
    return child.exited;
}
