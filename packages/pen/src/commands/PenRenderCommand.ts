import { execFile, spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';
import { noop } from '@nzyme/utils/functions/noop.js';

/** Lines of `pen`'s output shown when it wrote nothing. */
const OUTPUT_TAIL_LINES = 20;

/**
 * `pen render`: PNGs of chosen nodes of a `.pen` file, or of a revision of it, through the
 * repo's `pen` CLI run headless. The input is only read: `pen` saves to a temporary file.
 */
export class PenRenderCommand extends Command {
    static override paths = [['pen', 'render']];

    static override usage = Command.Usage({
        category: 'Pen',
        description: 'Render nodes of a .pen design file, or of a revision of it, to PNG',
        details: `
            Exports the given node ids as \`<id>.png\` through \`pen interactive\` (the repo's
            \`@pen.dev/cli\` dev dependency, logged in once per machine with \`bunx pen login\`). The source
            is a file or \`<rev>:<path>\` as \`git show\` takes it. The PNGs go to \`--out\`, or to a new
            temporary directory; their absolute paths are printed one per line.
        `,
        examples: [
            ['Render two screens of the working file', 'nzyme pen render design.pen a1B2c d3E4f'],
            ['Render a screen as main has it', 'nzyme pen render main:design.pen a1B2c --out renders/main'],
        ],
    });

    source = Option.String({ name: 'file | rev:path' });
    ids = Option.Rest({ name: 'id', required: 1 });
    out = Option.String('--out', { description: 'Directory for the PNGs (default: a new temporary directory)' });
    scale = Option.String('--scale', '2', { description: 'Image scale factor' });

    override async run() {
        const scale = Number(this.scale);
        if (!Number.isFinite(scale) || scale <= 0) {
            this.context.stderr.write(`pen render: --scale must be a positive number, got ${this.scale}\n`);
            return 1;
        }

        const pen = path.join(getProjectRoot(), 'node_modules', '.bin', 'pen');
        if (!(await exists(pen))) {
            this.context.stderr.write(
                'pen render: the `pen` CLI is not installed: add `@pen.dev/cli` as a dev dependency\n',
            );
            return 1;
        }

        const outDir =
            this.out === undefined ? await mkdtemp(path.join(os.tmpdir(), 'pen-render-')) : path.resolve(this.out);
        if (this.out === undefined) {
            this.context.stderr.write(`pen render: writing to ${outDir}\n`);
        }
        await mkdir(outDir, { recursive: true });

        const workDir = await mkdtemp(path.join(os.tmpdir(), 'pen-render-work-'));
        try {
            const input = await resolveInput(this.source, workDir);
            const before = await listPngs(outDir);
            const output = await runPen(pen, {
                args: ['interactive', '-i', input, '-o', path.join(workDir, 'output.pen')],
                stdin: `${buildExportCall({ ids: this.ids, outDir, scale })}\nexit()\n`,
            });

            if (output.includes('Authentication required')) {
                this.context.stderr.write(
                    'pen render: run `bunx pen login` once on this machine (the owner has to: it needs their pen.dev account)\n',
                );
                return 1;
            }

            const written = [...(await listPngs(outDir))].filter(([file, mtime]) => before.get(file) !== mtime);
            if (written.length === 0) {
                const tail = output.trimEnd().split('\n').slice(-OUTPUT_TAIL_LINES).join('\n');
                this.context.stderr.write(`pen render: pen wrote no PNG to ${outDir}; its output:\n${tail}\n`);
                return 1;
            }

            for (const [file] of written) {
                this.context.stdout.write(`${file}\n`);
            }
            return 0;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`pen render: ${reason}\n`);
            return 1;
        } finally {
            await rm(workDir, { recursive: true, force: true });
        }
    }
}

/** Options of {@link buildExportCall}. */
interface BuildExportCallOptions {
    ids: string[];
    outDir: string;
    scale: number;
}

/** The `pen interactive` line exporting the nodes; every value is a JSON literal, so no id or path can break out. */
function buildExportCall(options: BuildExportCallOptions): string {
    const { ids, outDir, scale } = options;
    const snippet = `Export(${JSON.stringify(ids)}, "png", ${JSON.stringify(outDir)}, {scale: ${scale}})`;
    return `execute({ input: ${JSON.stringify(snippet)} })`;
}

/** A file on disk is used as it is; anything else is read with `git show` into the work directory. */
async function resolveInput(source: string, workDir: string): Promise<string> {
    if (await exists(source)) {
        return path.resolve(source);
    }

    if (!source.includes(':')) {
        throw new Error(`no file ${source}, and not a <rev>:<path>`);
    }

    const { stdout } = await promisify(execFile)('git', ['show', source], { maxBuffer: 1024 * 1024 * 1024 });
    const file = path.join(workDir, 'input.pen');
    await writeFile(file, stdout);
    return file;
}

/** Options of {@link runPen}. */
interface RunPenOptions {
    args: string[];
    stdin: string;
}

/** Runs `pen`, feeding it `stdin`, and resolves with its stdout and stderr interleaved. */
function runPen(pen: string, options: RunPenOptions): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(pen, options.args, { stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
        child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
        child.on('error', reject);
        child.on('close', () => resolve(output));
        // `pen` may exit before reading its input (on a missing login); that is not an error here.
        child.stdin.on('error', noop);
        child.stdin.end(options.stdin);
    });
}

/** The PNGs in the directory, by absolute path in name order, with their modification times. */
async function listPngs(dir: string): Promise<Map<string, number>> {
    const pngs = new Map<string, number>();
    for (const name of (await readdir(dir)).toSorted()) {
        if (name.endsWith('.png')) {
            const file = path.join(dir, name);
            pngs.set(file, (await stat(file)).mtimeMs);
        }
    }

    return pngs;
}

async function exists(file: string): Promise<boolean> {
    return access(file).then(
        () => true,
        () => false,
    );
}
