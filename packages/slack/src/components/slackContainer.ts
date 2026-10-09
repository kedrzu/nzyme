import type { ContainerBlock } from '@slack/web-api';

/**
 * Configuration options for creating a Slack container block
 */
export type SlackContainer = {
    /** Plain-text title, shown even when the container is collapsed. Max 150 characters. */
    title: string;
    /** Child blocks, at most 10. */
    blocks: ContainerBlock['child_blocks'];
    /** Renders the container collapsed to its title, expandable by the reader. */
    collapsed?: boolean;
};

/**
 * Creates a container block grouping child blocks under a title — collapsible, so a long detail
 * list does not bury the rest of the message.
 *
 * @param options Configuration options for the container
 * @returns Slack container block
 */
export function slackContainer(options: SlackContainer): ContainerBlock {
    return {
        type: 'container',
        title: {
            type: 'plain_text',
            text: options.title,
        },
        child_blocks: options.blocks,
        is_collapsible: options.collapsed,
        default_collapsed: options.collapsed,
    };
}
