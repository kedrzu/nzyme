# @nzyme/sentry-cli

CLI commands for integrating Sentry issue management with GitHub workflows.

## Features

- **Issue Info**: Display comprehensive Sentry issue information
- **Issue Start**: Create branches and PRs for Sentry issues
- **Issue Ready**: Convert draft PRs to ready for review
- **Issue Refresh**: Sync branches with latest base branch changes

## Installation

```bash
yarn add @nzyme/sentry-cli
```

## Usage

### Configuration

```typescript
import { defineSentryCommands } from '@nzyme/sentry-cli';
import type { SentryConfig, SentryCommandsOptions } from '@nzyme/sentry-cli';

const sentryConfig: SentryConfig = {
    apiToken: 'your-sentry-auth-token',
    organizationSlug: 'your-org-slug',
    apiUrl: 'https://sentry.io/api/0', // optional, defaults to sentry.io
    defaultPrefix: 'MYPROJECT', // optional, for numeric issue IDs
};

const githubConfig = {
    token: 'your-github-token',
    owner: 'repository-owner',
    repo: 'repository-name',
};

const options: SentryCommandsOptions = {
    sentry: sentryConfig,
    github: githubConfig,
    prefix: 'sentry', // optional command prefix
    baseBranch: 'main', // or () => 'develop'
    beforeEach: async () => {
        // Optional setup before each command
    },
};

// Register commands with your CLI framework
const commands = defineSentryCommands(options);
```

### Commands

#### `issue info`

Display information about the current Sentry issue based on branch name:

```bash
# Detects issue ID from current branch name
sentry issue info
```

Shows:

- Issue title and description
- Issue type, level, and occurrence count
- Project information
- Associated GitHub PR status
- Direct links to Sentry issue and PR

#### `issue <identifier>`

Start working on a Sentry issue:

```bash
# By issue ID
sentry issue MYPROJECT-123

# By numeric ID (uses defaultPrefix)
sentry issue 123

# By Sentry URL
sentry issue https://sentry.io/organizations/myorg/issues/12345/
```

This command:

1. Fetches issue details from Sentry
2. Searches for existing GitHub PR
3. Either checks out existing branch or creates new branch + draft PR
4. Handles uncommitted changes interactively

#### `issue ready`

Convert current issue's PR from draft to ready for review:

```bash
sentry issue ready
```

This command:

1. Detects issue from current branch
2. Prompts to commit/push any pending changes
3. Finds associated GitHub PR
4. Converts PR from draft to ready for review

#### `issue refresh`

Refresh current branch with latest base branch changes:

```bash
sentry issue refresh
```

This command:

1. Fetches latest base branch changes
2. Automatically merges base branch into current branch
3. Handles merge conflicts if they occur

### Branch Naming Convention

The CLI expects and creates branches following this pattern:

- `MYPROJECT-123-issue-description`
- `feature/MYPROJECT-123-something`
- `fix/MYPROJECT-123`

The issue ID extraction supports various formats and is case-insensitive.

### Authentication

You'll need:

1. **Sentry Auth Token**: Create at https://sentry.io/settings/auth-tokens/
2. **GitHub Token**: Create at https://github.com/settings/tokens with repo permissions

## Integration with Other Tools

This package works well with:

- `@nzyme/github-cli` - Provides the underlying GitHub operations
- `@nzyme/cli` - Framework for building CLI applications
- `@nzyme/logging` - Structured logging for CLI operations

## API Reference

See the exported types and functions in the main package for detailed TypeScript definitions.
