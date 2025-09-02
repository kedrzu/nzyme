/**
 * Parse a Sentry issue identifier from various formats.
 * Supports:
 * - Full URLs: https://sentry.io/organizations/myorg/issues/12345/
 * - Issue IDs with prefix: MYPROJECT-123
 * - Plain numbers: 123 (will be prefixed with defaultPrefix if provided)
 * @__NO_SIDE_EFFECTS__
 */
export function parseIssueIdentifier(identifier: string, defaultPrefix?: string): string {
    // Handle Sentry URLs
    const urlMatch = identifier.match(/\/issues\/(\d+)\//);
    if (urlMatch) {
        return urlMatch[1]!;
    }

    // Handle issue IDs with prefix (e.g., MYPROJECT-123)
    const prefixMatch = identifier.match(/^([a-zA-Z]+-\d+)$/);
    if (prefixMatch) {
        return prefixMatch[1]!.toUpperCase();
    }

    // Handle plain numbers
    const numberMatch = identifier.match(/^\d+$/);
    if (numberMatch) {
        if (defaultPrefix) {
            return `${defaultPrefix.toUpperCase()}-${identifier}`;
        }
        // For Sentry, we typically work with numeric issue IDs directly
        return identifier;
    }

    // Return as-is if no pattern matches
    return identifier;
}
