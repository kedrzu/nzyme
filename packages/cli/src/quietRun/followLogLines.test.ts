import { appendFile, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import { followLogLines } from './followLogLines.js';

test('emits each complete line once, holding a partial line and a split character until they finish', async () => {
    const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'follow-log-')), 'run.log');
    await writeFile(file, '');
    const lines: string[] = [];
    const follower = await followLogLines({ path: file, onLine: line => lines.push(line) });

    await appendFile(file, 'first\nsec');
    await follower.poll();
    expect(lines).toEqual(['first']);

    const zolw = Buffer.from('żółw');
    await appendFile(file, Buffer.concat([Buffer.from('ond\n'), zolw.subarray(0, 1)]));
    await follower.poll();
    expect(lines).toEqual(['first', 'second']);

    await appendFile(file, Buffer.concat([zolw.subarray(1), Buffer.from('\nunterminated')]));
    await follower.poll();
    expect(lines).toEqual(['first', 'second', 'żółw']);

    await follower.finish();
    expect(lines).toEqual(['first', 'second', 'żółw', 'unterminated']);
});
