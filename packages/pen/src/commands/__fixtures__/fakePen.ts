/**
 * Stands in for the `pen` CLI in the render tests: runs the `execute` calls it is fed on stdin
 * with an `Export` that writes a placeholder PNG per node, as `pen interactive` would once logged in.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const input = args[args.indexOf('-i') + 1];
const output = args[args.indexOf('-o') + 1];
if (args[0] !== 'interactive' || !input || !output || path.resolve(input) === path.resolve(output)) {
    console.error(`[ERROR] unexpected arguments: ${JSON.stringify(args)}`);
    process.exit(1);
}

JSON.parse(readFileSync(input, 'utf8'));

for (const line of readFileSync(0, 'utf8').split('\n')) {
    const call = /^execute\(\{ input: (".*") \}\)$/.exec(line);
    const snippet: unknown = call?.[1] === undefined ? null : JSON.parse(call[1]);
    const exportCall = typeof snippet === 'string' ? /^Export\((\[.*\]), "png", (".*"), \{scale: 2\}\)$/.exec(snippet) : null;
    if (!exportCall?.[1] || !exportCall[2]) {
        continue;
    }

    const ids: string[] = JSON.parse(exportCall[1]);
    const dir: string = JSON.parse(exportCall[2]);
    for (const id of ids) {
        writeFileSync(path.join(dir, `${id}.png`), 'png');
        console.log(path.join(dir, `${id}.png`));
    }
}
