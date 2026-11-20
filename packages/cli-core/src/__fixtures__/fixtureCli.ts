/**
 * A one-command CLI run as a real process by `execute.test.ts`, so what lands on stdout and stderr, and the exit code,
 * can be observed as a caller sees them.
 */
import { Option } from 'clipanion';

import { Command } from '../Command.js';
import { execute } from '../execute.js';

/** Prints its `--name` on stdout, the way a command's output is a contract its caller parses. */
class EchoCommand extends Command {
    static override paths = [Command.Default];

    name = Option.String('--name', 'world');

    protected override run() {
        this.context.stdout.write(`${this.name}\n`);
    }
}

await execute({ name: 'fixture', version: '1.2.3', commands: [EchoCommand] });
