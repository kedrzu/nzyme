import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveWorkspace } from './resolveWorkspace.js';

const OPTIONS = { folder: 'documents', recovered: 'recovered' };

test('excludes the documents and recovered folders from git, once', async () => {
    const repo = await tempRepo();
    try {
        await resolveWorkspace({ cwd: repo, ...OPTIONS });
        await resolveWorkspace({ cwd: repo, ...OPTIONS });

        const exclude = await readFile(join(repo, '.git', 'info', 'exclude'), 'utf8');
        expect(exclude.split('\n').filter(line => line === '/documents')).toHaveLength(1);
        expect(exclude.split('\n').filter(line => line === '/recovered')).toHaveLength(1);

        await mkdir(join(repo, 'documents'));
        await Bun.write(join(repo, 'documents', 'secret.md'), 'private');
        expect(await run(repo, ['status', '--porcelain'])).toBe('');
    } finally {
        await rm(repo, { recursive: true, force: true });
    }
});

test('keeps existing exclude entries and creates info/ when missing', async () => {
    const repo = await tempRepo();
    try {
        await rm(join(repo, '.git', 'info'), { recursive: true, force: true });
        await resolveWorkspace({ cwd: repo, ...OPTIONS });
        expect(await readFile(join(repo, '.git', 'info', 'exclude'), 'utf8')).toBe('/documents\n/recovered\n');

        await Bun.write(join(repo, '.git', 'info', 'exclude'), '*.log');
        await resolveWorkspace({ cwd: repo, ...OPTIONS });
        expect(await readFile(join(repo, '.git', 'info', 'exclude'), 'utf8')).toBe('*.log\n/documents\n/recovered\n');
    } finally {
        await rm(repo, { recursive: true, force: true });
    }
});

async function tempRepo(): Promise<string> {
    const repo = await realpath(await mkdtemp(join(tmpdir(), 'outline-workspace-')));
    await run(repo, ['init', '-q']);
    await run(repo, ['config', 'user.name', 'Test']);
    await run(repo, ['config', 'user.email', 'test@example.com']);
    return repo;
}

async function run(cwd: string, args: string[]): Promise<string> {
    const child = Bun.spawn(['git', '-C', cwd, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const [output] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    return output.trim();
}
