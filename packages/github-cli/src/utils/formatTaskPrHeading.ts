/**
 * Inputs of the heading that opens a task PR body.
 */
export interface FormatTaskPrHeadingParams {
    issueId: string;
    taskUrl: string;
    title: string;
}

/**
 * Build the `# [ID](url) Title` line that opens a task PR body, shared so a rename can rewrite it in place.
 * @__NO_SIDE_EFFECTS__
 */
export function formatTaskPrHeading(params: FormatTaskPrHeadingParams): string {
    const { issueId, taskUrl, title } = params;

    return `# [${issueId}](${taskUrl}) ${title}`;
}
