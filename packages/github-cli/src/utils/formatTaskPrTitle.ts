/**
 * Inputs of a task PR title.
 */
export interface FormatTaskPrTitleParams {
    issueId: string;
    /**
     * Linear project the task belongs to; the title carries no project tag without it.
     */
    projectName?: string;
    title: string;
    /**
     * Branch version of a reopened task; only versions above 1 show up in the title.
     */
    version?: number;
}

/**
 * Build the `[ID][Project] Title` PR title, so every place that creates or renames a task PR agrees on it.
 * @__NO_SIDE_EFFECTS__
 */
export function formatTaskPrTitle(params: FormatTaskPrTitleParams): string {
    const { issueId, projectName, title, version } = params;

    const tag = projectName ? `[${issueId}][${projectName}]` : `[${issueId}]`;
    const versionSuffix = version != null && version > 1 ? ` (v${version})` : '';

    return `${tag} ${title}${versionSuffix}`;
}
