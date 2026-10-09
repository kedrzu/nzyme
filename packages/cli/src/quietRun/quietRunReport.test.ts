import { describe, expect, test } from 'bun:test';

import {
    extractErrorLines,
    getBunUsageBanner,
    getQuietRunLogFileName,
    renderQuietRunReport,
} from './quietRunReport.js';

describe('extractErrorLines', () => {
    test('returns error-looking lines prefixed with their 1-based line number', () => {
        const log = [
            'building…',
            'src/a.ts(3,1): error TS2322: Type mismatch',
            'all good here',
            'Test FAILED: adds numbers',
            'Cannot find module x',
            'thing not found',
            'Unexpected token',
            '✗ broken',
            '',
        ].join('\n');

        expect(extractErrorLines(log, 40)).toEqual([
            '2:src/a.ts(3,1): error TS2322: Type mismatch',
            '4:Test FAILED: adds numbers',
            '5:Cannot find module x',
            '6:thing not found',
            '7:Unexpected token',
            '8:✗ broken',
        ]);
    });

    test('matches whole words only where the signature says so', () => {
        expect(extractErrorLines('errors: 0\nterrorist\nfailsafe\n', 40)).toEqual([]);
        expect(extractErrorLines('ts1234 lowercase code\n', 40)).toEqual(['1:ts1234 lowercase code']);
    });

    test('stops at the limit', () => {
        const log = 'error 1\nerror 2\nerror 3\n';
        expect(extractErrorLines(log, 2)).toEqual(['1:error 1', '2:error 2']);
    });
});

describe('getBunUsageBanner', () => {
    test('detects the banner on the first non-empty line', () => {
        expect(getBunUsageBanner('\n  \nUsage: bun run [flags] <file or script>\nmore')).toBe(
            'Usage: bun run [flags] <file or script>',
        );
    });

    test('ignores a later mention of the banner', () => {
        expect(getBunUsageBanner('real output\nUsage: bun run [flags]\n')).toBeNull();
    });

    test('ignores an indented banner and an empty log', () => {
        expect(getBunUsageBanner('  Usage: bun run\n')).toBeNull();
        expect(getBunUsageBanner('')).toBeNull();
    });
});

describe('getQuietRunLogFileName', () => {
    test('slugs the executable and stamps date and pid', () => {
        const date = new Date(2026, 0, 2, 3, 4, 5);
        expect(getQuietRunLogFileName({ executable: './scripts/build me.sh', date, pid: 42 })).toBe(
            '.-scripts-build-me.sh-20260102-030405-42.log',
        );
    });
});

describe('renderQuietRunReport', () => {
    const base = { label: 'bun test', logPath: '.context/cmd-logs/x.log', seconds: 3, tailCount: 2, maxMatches: 40 };

    test('prints a single line on success', () => {
        expect(renderQuietRunReport({ ...base, exitCode: 0, log: 'a\nb\n' })).toEqual({
            exitCode: 0,
            stdout: '✓ passed · bun test · 2 lines · 3s · full log: .context/cmd-logs/x.log\n',
            stderr: '',
        });
    });

    test('turns a bun usage banner with exit 0 into a failure', () => {
        const report = renderQuietRunReport({ ...base, exitCode: 0, log: 'Usage: bun run [flags] <script>\n' });

        expect(report.exitCode).toBe(1);
        expect(report.stdout).toBe('');
        expect(report.stderr).toBe(
            '✗ FAILED (bun usage banner — invalid invocation exited 0 without running anything) · bun test · full log: .context/cmd-logs/x.log\n' +
                '  first output line: Usage: bun run [flags] <script>\n',
        );
    });

    test('prints error lines, the tail and the log path on failure, passing the exit code through', () => {
        const report = renderQuietRunReport({ ...base, exitCode: 3, log: 'one\nerror: two\nthree\n' });

        expect(report.exitCode).toBe(3);
        expect(report.stdout).toBe(
            [
                '✗ FAILED (exit 3) · bun test · 3 lines · 3s · full log: .context/cmd-logs/x.log',
                '--- error-signature lines (grep) ---',
                '2:error: two',
                '--- last 2 lines ---',
                'error: two',
                'three',
                '--- full log: .context/cmd-logs/x.log (read selectively; do not re-dump it whole) ---',
                '',
            ].join('\n'),
        );
    });

    test('says so when a failure has no error-looking lines', () => {
        const report = renderQuietRunReport({ ...base, exitCode: 1, log: 'quiet\n' });

        expect(report.stdout).toContain('(no matching error lines — read the tail / full log below)');
    });
});
