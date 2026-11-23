import { Option } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatHeaderBlock } from '@nzyme/cli-core/utils/formatHeaderBlock.js';

import type { LastfmCommandParams } from './defineLastfmCommands.js';
import { LastfmTagGetInfo } from './LastfmTagGetInfo.js';
import { cleanLastfmText } from './utils/cleanLastfmText.js';

/**
 * Defines `<prefix> tag <tag>`: a tag's usage and description as a `key: value` block.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLastfmTagCommand(params: LastfmCommandParams): CommandClass {
    const { prefix } = params;

    return class LastfmTagCommand extends Command {
        static override paths = [[...prefix.split(' '), 'tag']];
        static override usage = Command.Usage({
            category: 'Last.fm',
            description: "Show a tag's usage and description",
            details: `
                Prints a \`key: value\` block: name, reach (how many users applied the tag), total (how
                many times it was applied) and a short plain-text summary; a field Last.fm has no value
                for is left out.
            `,
            examples: [['The shoegaze tag', `${prefix} tag shoegaze`]],
        });

        tag = Option.String({ name: 'tag' });

        override async run() {
            const lastfm = this.container.resolve(params.client);

            const tag = await lastfm(LastfmTagGetInfo, { tag: this.tag });
            if (!tag) {
                this.context.stderr.write(`Not found: tag ${this.tag}\n`);
                return 1;
            }

            this.context.stdout.write(
                formatHeaderBlock([
                    ['name', tag.name],
                    ['reach', String(tag.reach)],
                    ['total', String(tag.total)],
                    ['summary', cleanLastfmText(tag.summary)],
                ]),
            );

            return 0;
        }
    };
}
