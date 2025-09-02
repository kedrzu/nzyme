# @nzyme/github-cli

Common GitHub utilities for CLI tools that integrate with GitHub repositories.

## Features

- **Branch Management**: Create, checkout, and manage git branches
- **Pull Request Operations**: Create draft PRs, convert to ready for review
- **Git Status Utilities**: Check for uncommitted changes, unpushed commits
- **Branch Synchronization**: Sync with base branches, handle merging
- **Interactive Workflows**: Handle stashing, branch selection with user prompts

## Installation

```bash
yarn add @nzyme/github-cli
```

## Usage

### Basic GitHub Configuration

```typescript
import type { GitHubConfig } from '@nzyme/github-cli';

const githubConfig: GitHubConfig = {
    token: 'your-github-token',
    owner: 'repository-owner',
    repo: 'repository-name',
};
```

### Common Operations

```typescript
import {
    createOctokitClient,
    getCurrentBranch,
    findMatchingPr,
    createBranchAndPr,
    convertPrToReady,
    syncBaseBranch,
} from '@nzyme/github-cli';

// Create GitHub client
const octokit = createOctokitClient(githubConfig);

// Get current branch
const branch = await getCurrentBranch();

// Find PR for an issue
const pr = await findMatchingPr(octokit, githubConfig, 'ISSUE-123');

// Create new branch and PR
const result = await createBranchAndPr({
    octokit,
    config: githubConfig,
    branchName: 'feature-branch',
    prTitle: 'Feature: New functionality',
    description: 'Description of changes',
    issueId: 'ISSUE-123',
    taskUrl: 'https://example.com/issues/123',
    issueTitle: 'Issue title',
    baseBranch: 'main',
});

// Convert PR to ready for review
await convertPrToReady(octokit, githubConfig, pr.number);

// Sync with base branch
await syncBaseBranch('main', logger);
```

## API Reference

### Core Functions

- `createOctokitClient(config)` - Create authenticated GitHub API client
- `getCurrentBranch()` - Get current git branch name
- `findMatchingPr(octokit, config, issueId)` - Find PR matching an issue ID
- `createBranchAndPr(params)` - Create new branch and draft PR
- `convertPrToReady(octokit, config, prNumber)` - Convert draft PR to ready

### Git Operations

- `checkoutBranch(branchName)` - Checkout branch with fetch
- `checkoutExistingBranch(branchName, taskId, logger)` - Interactive checkout with stash handling
- `syncBaseBranch(baseBranch, logger, skipPrompt?)` - Sync current branch with base

### Status & Preparation

- `getGitStatusInfo()` - Get detailed git status information
- `checkUnpushedCommits()` - Check for unpushed commits
- `handleReadyPreparation(unpushed, status, logger)` - Interactive preparation for PR review

### Interactive Workflows

- `handleBranchSelection(current, base, taskId, logger)` - Choose base branch with stash handling
- `applyStashedChanges(stashName, logger)` - Apply previously stashed changes

## Types

All major functions export their parameter and result types for TypeScript integration.
