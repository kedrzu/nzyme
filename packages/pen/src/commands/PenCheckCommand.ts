import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';

import type { PenProblem } from '../checkPen.js';
import { checkPen } from '../checkPen.js';

/**
 * `pen check`: fails on a `.pen` file Pen can't open or a merge broke, so a repo's lint catches it
 * before it lands.
 */
export class PenCheckCommand extends Command {
    static override paths = [['pen', 'check']];

    static override usage = Command.Usage({
        category: 'Pen',
        description: 'Check .pen design files for conflict markers, broken references and undefined variables',
        details: `
            Checks the given files, or every \`.pen\` file git tracks. Reports conflict markers,
            invalid JSON, duplicate ids or ids containing \`/\`, instances of missing or
            non-reusable nodes, and references to undefined variables, each with its file and node.
            An unknown format version is a warning. Exits 1 when any file has an error.
        `,
        examples: [
            ['Check every tracked .pen file', 'nzyme pen check'],
            ['Check one file', 'nzyme pen check design.pen'],
        ],
    });

    files = Option.Rest();

    override async run() {
        const files = this.files.length > 0 ? this.files : await listTrackedPenFiles();
        let errors = 0;

        for (const file of files) {
            for (const problem of await checkFile(file)) {
                this.context.stderr.write(`${formatProblem(file, problem)}\n`);
                if (problem.severity === 'error') {
                    errors++;
                }
            }
        }

        if (errors > 0) {
            this.context.stderr.write(`pen check: ${errors} error(s)\n`);
            return 1;
        }

        this.context.stdout.write(`pen check: ${files.length} file(s) OK\n`);
        return 0;
    }
}

async function listTrackedPenFiles(): Promise<string[]> {
    const { stdout } = await promisify(execFile)('git', ['ls-files', '-z', '--', '*.pen'], {
        maxBuffer: 16 * 1024 * 1024,
    });

    return stdout.split('\0').filter(file => file !== '');
}

async function checkFile(file: string): Promise<PenProblem[]> {
    let text: string;
    try {
        text = await readFile(file, 'utf8');
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return [{ severity: 'error', nodeId: null, message: `cannot read the file: ${reason}` }];
    }

    return checkPen(text);
}

function formatProblem(file: string, problem: PenProblem): string {
    const node = problem.nodeId === null ? '' : ` node ${problem.nodeId}:`;
    const severity = problem.severity === 'warning' ? ' warning:' : '';
    return `${file}:${node}${severity} ${problem.message}`;
}
