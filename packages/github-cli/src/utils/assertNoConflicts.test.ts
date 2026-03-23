import { describe, expect, mock, test } from 'bun:test';

import type { SimpleGit, StatusResult } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { GitMergeConflictError } from './GitMergeConflictError.js';
import { assertNoConflicts } from './assertNoConflicts.js';

function createMockGit(conflictedFiles: string[]): SimpleGit {
    return {
        status: mock(() =>
            Promise.resolve({
                conflicted: conflictedFiles,
            } as StatusResult),
        ),
    } as unknown as SimpleGit;
}

function createMockLogger(): Logger {
    return {
        error: mock(() => {}),
        info: mock(() => {}),
        warn: mock(() => {}),
        debug: mock(() => {}),
    } as unknown as Logger;
}

describe('assertNoConflicts', () => {
    test('does not throw when there are no conflicts', async () => {
        const git = createMockGit([]);
        const logger = createMockLogger();

        await expect(
            assertNoConflicts({ git, repoDisplayName: 'test-repo', logger, operation: 'merge' }),
        ).resolves.toBeUndefined();
    });

    test('throws GitMergeConflictError with operation "merge" when operation is merge', async () => {
        const git = createMockGit(['file1.ts']);
        const logger = createMockLogger();

        try {
            await assertNoConflicts({ git, repoDisplayName: 'test-repo', logger, operation: 'merge' });
            expect(true).toBe(false); // Should not reach here
        } catch (error) {
            expect(error).toBeInstanceOf(GitMergeConflictError);
            const conflictError = error as GitMergeConflictError;
            expect(conflictError.operation).toBe('merge');
        }
    });

    test('throws GitMergeConflictError with operation "rebase" when operation is rebase', async () => {
        const git = createMockGit(['file1.ts']);
        const logger = createMockLogger();

        try {
            await assertNoConflicts({ git, repoDisplayName: 'test-repo', logger, operation: 'rebase' });
            expect(true).toBe(false); // Should not reach here
        } catch (error) {
            expect(error).toBeInstanceOf(GitMergeConflictError);
            const conflictError = error as GitMergeConflictError;
            expect(conflictError.operation).toBe('rebase');
        }
    });

    test('logs correct operation name for rebase conflicts', async () => {
        const git = createMockGit(['file1.ts']);
        const logger = createMockLogger();

        try {
            await assertNoConflicts({ git, repoDisplayName: 'test-repo', logger, operation: 'rebase' });
        } catch {
            // Expected
        }

        const errorCalls = (logger.error as ReturnType<typeof mock>).mock.calls;
        const errorMessages = errorCalls.map((call: unknown[]) => call[0] as string);
        const conflictMessage = errorMessages.find((msg: string) => msg.includes('conflict'));

        expect(conflictMessage).toBeDefined();
        expect(conflictMessage).toContain('Rebase');
        expect(conflictMessage).not.toContain('Merge');
    });

    test('logs correct operation name for merge conflicts', async () => {
        const git = createMockGit(['file1.ts']);
        const logger = createMockLogger();

        try {
            await assertNoConflicts({ git, repoDisplayName: 'test-repo', logger, operation: 'merge' });
        } catch {
            // Expected
        }

        const errorCalls = (logger.error as ReturnType<typeof mock>).mock.calls;
        const errorMessages = errorCalls.map((call: unknown[]) => call[0] as string);
        const conflictMessage = errorMessages.find((msg: string) => msg.includes('conflict'));

        expect(conflictMessage).toBeDefined();
        expect(conflictMessage).toContain('Merge');
    });
});
