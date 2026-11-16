import { PassThrough } from 'node:stream';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { Cli } from 'clipanion';

import { defineLinearSchemaCommand } from './LinearSchemaCommand.js';

const originalFetch = globalThis.fetch;

beforeEach(() => {
    // The schema commands are offline: any network call fails the test.
    globalThis.fetch = Object.assign(
        () => {
            throw new Error('network call from a schema command');
        },
        { preconnect: originalFetch.preconnect },
    );
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

test('Issue lists fields with arguments, one per line', async () => {
    const { exitCode, stdout } = await runSchema(['Issue']);

    expect(exitCode).toBe(0);
    const lines = stdout.split('\n');
    expect(lines).toContain('identifier: String!');
    expect(lines.some(line => /^comments\(.*first: Int.*\): CommentConnection!$/.test(line))).toBe(true);
    expect(stdout).not.toContain('#');
});

test('--descriptions appends first-sentence comments', async () => {
    const plain = await runSchema(['Issue']);
    const described = await runSchema(['Issue', '--descriptions']);

    expect(described.stdout.length).toBeGreaterThan(plain.stdout.length);
    expect(described.stdout).toMatch(/^identifier: String! {2}# .+/m);
});

test('an input type lists its fields as name: Type', async () => {
    const { stdout } = await runSchema(['IssueCreateInput']);

    expect(stdout).toMatch(/^teamId: String!$/m);
});

test('an enum lists its values', async () => {
    const { stdout } = await runSchema(['IssueRelationType']);

    expect(stdout).toMatch(/^enum IssueRelationType\nblocks\n/);
});

test('Query and Mutation work as types, and --search narrows a type by field name', async () => {
    const query = await runSchema(['Query']);
    const mutations = await runSchema(['Mutation', '--search', 'issueCreate']);

    expect(query.stdout).toMatch(/^viewer: User!$/m);
    expect(mutations.stdout).toMatch(/^issueCreate\(input: IssueCreateInput!\): IssuePayload!$/m);
    expect(mutations.stdout).not.toMatch(/^viewer/m);
});

test('--search without a type finds types and Type.field names', async () => {
    const { exitCode, stdout } = await runSchema(['--search', 'delegate']);

    expect(exitCode).toBe(0);
    expect(stdout.split('\n')).toContain('Issue.delegate');
    expect(stdout.split('\n')).toContain('IssueCreateInput.delegateId');
});

test('a broad search is capped and says how many more matched', async () => {
    const { stdout } = await runSchema(['--search', 'id']);

    const lines = stdout.trimEnd().split('\n');
    expect(lines).toHaveLength(41);
    expect(lines[40]).toMatch(/^… and \d+ more matches; narrow the search$/);
});

test('an unknown type exits 1 and suggests close type names', async () => {
    const { exitCode, stdout, stderr } = await runSchema(['issuecreate']);

    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('Unknown type issuecreate');
    expect(stderr).toContain('IssueCreateInput');
});

test('no type and no --search is a usage error', async () => {
    const { exitCode, stderr } = await runSchema([]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('--search');
});

async function runSchema(args: string[]) {
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();
    let stdout = '';
    let stderr = '';
    stdoutStream.on('data', chunk => {
        stdout += String(chunk);
    });
    stderrStream.on('data', chunk => {
        stderr += String(chunk);
    });

    const cli = new Cli<CommandContext>({ binaryName: 'healed', enableColors: false });
    cli.register(defineLinearSchemaCommand({ prefix: 'linear', linear: { apiToken: 'unused' } }));

    const exitCode = await cli.run(['linear', 'schema', ...args], {
        container: createContainer(),
        stdout: stdoutStream,
        stderr: stderrStream,
    });
    return { exitCode, stdout, stderr };
}
