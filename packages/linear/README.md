# @nzyme/linear

A CLI tool for Linear and GitHub integration that streamlines the developer workflow when working with Linear tasks.

## Features

- Start work on Linear tasks by ID, number, or URL
- Automatically find existing GitHub PRs for Linear tasks with precise matching
- Create new branches and draft PRs when no existing PR is found
- Convert draft PRs to ready for review with uncommitted change detection
- Smart branch naming based on Linear task details
- Automatic task ID extraction from branch names
- Proper PR formatting with task references
- Robust git operations using simple-git

## Installation

```bash
yarn add @nzyme/linear
```

## Usage

### Basic Setup

```typescript
import { defineLinearCommands } from '@nzyme/linear';

const commands = defineLinearCommands({
    linear: {
        apiToken: process.env.LINEAR_API_TOKEN,
        defaultPrefix: 'SIG', // Optional: default team prefix
    },
    github: {
        token: process.env.GITHUB_TOKEN,
        owner: 'your-organization',
        repo: 'your-repository',
    },
    prefix: 'linear', // Optional: command prefix
});
```

### Commands

#### `task` - Start working on a Linear task

```bash
# Start work on task by full ID
task SIG-123

# Start work on task by number (requires defaultPrefix)
task 123

# Start work on task by Linear URL
task https://linear.app/your-team/issue/SIG-123/task-title
```

#### `task list` - List and switch to active tasks

```bash
# Show interactive list of tasks in progress and in review assigned to you
task list
```

This command will:

1. Fetch all Linear tasks assigned to you with status "In Progress" or "In Review"
2. Sort tasks by creation date (newest first)
3. Look up associated GitHub pull requests for each task
4. Display them in an interactive selection menu with:
    - Task ID and status (color-coded: yellow for "In Progress", green for "In Review")
    - Task title (truncated if long)
    - Associated PR number (if available)
    - "[Current]" indicator for the task matching your current branch
5. Switch to the selected task using the same logic as `task <id>`

#### `task push` - Convert current task to ready for review

```bash
# Convert the current branch's PR from draft to ready for review
task push
```

This command will:

1. Check for uncommitted changes (fails if any exist)
2. Extract the task ID from the current branch name
3. Find the associated GitHub PR
4. Convert the PR from draft to ready for review

### Complete Workflow Example

```bash
# 1. Start working on a task (creates branch + draft PR)
task SIG-123

# 2. Make your code changes
# ... edit files, add features, fix bugs ...

# 3. Commit your changes
git add .
git commit -m "Implement user authentication feature"
git push

# 4. Mark as ready for review
task push
```

### Workflow

When you run the `task` command, it will:

1. **Find the Linear task** - Validates the task exists and retrieves details
2. **Search for existing PR** - Looks for open GitHub PRs that reference the task ID in:
    - PR title (using precise matching)
    - Branch name (using precise matching)
3. **If PR exists**: Checks out the existing branch
4. **If no PR exists**:
    - Creates a new branch based on Linear's suggested branch name
    - Creates a draft PR with proper formatting
    - Checks out the new branch

### Precise Issue ID Matching

The tool uses smart regex matching to ensure accurate PR detection:

- `SIG-12` will **not** match `SIG-123` or `SIG-1234`
- Issue IDs must be properly bounded by delimiters (spaces, brackets, dashes, etc.)
- Matching is case-insensitive
- Works with various formats: `[SIG-123]`, `feat/SIG-123-auth`, `SIG-123.branch`

### Branch Naming Conventions

For the `task push` command to work, your branch name must contain the Linear task ID:

**✅ Supported formats:**

- `SIG-123-implement-auth`
- `feature/SIG-123-user-login`
- `SIG-123`
- `fix/SIG-456-bug-fix`
- `hotfix/SIG-789`

**❌ Not supported:**

- `implement-auth` (no task ID)
- `feature-branch` (no task ID)
- `random-branch-name` (no task ID)

### PR Format

Created PRs follow this format:

**Title**: `[TASK-ID][Project Name] Task Title`

**Body**:

```markdown
# [SIG-123](https://linear.app/sig/issue/SIG-123/task-title) Task Title

[Full task description from Linear]
```

**Example**: `[SIG-123][Authentication System] Implement user authentication feature`

## Configuration

### Linear Configuration

```typescript
interface LinearConfig {
    apiToken: string; // Linear API token
    defaultPrefix?: string; // Default team prefix (e.g., 'SIG')
}
```

### GitHub Configuration

```typescript
interface GitHubConfig {
    token: string; // GitHub personal access token
    owner: string; // Repository owner
    repo: string; // Repository name
}
```

## Environment Variables

```bash
# Required
LINEAR_API_TOKEN=your_linear_api_token
GITHUB_TOKEN=your_github_token

# Your configuration
GITHUB_OWNER=your-organization
GITHUB_REPO=your-repository
LINEAR_DEFAULT_PREFIX=SIG
```

## Setup Guide

### Creating a GitHub Personal Access Token

The tool requires a GitHub Personal Access Token (PAT) to interact with the GitHub API. Follow these steps:

1. **Go to GitHub Settings**
    - Visit [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
    - Or navigate: GitHub profile → Settings → Developer settings → Personal access tokens

2. **Generate New Token**
    - Click "Generate new token" → "Generate new token (classic)"
    - Give it a descriptive name like "Linear CLI Tool"
    - Set an appropriate expiration date

3. **Required Permissions**

    **For Public Repositories:**
    - ✅ `public_repo` - Access to public repositories

    **For Private Repositories:**
    - ✅ `repo` - Full control of private repositories
        - This includes: `repo:status`, `repo_deployment`, `public_repo`, `repo:invite`, `security_events`

    **Additional Recommended Permissions:**
    - ✅ `workflow` - Update GitHub Action workflows (if your PRs trigger workflows)

4. **Copy the Token**
    - ⚠️ **Important**: Copy the token immediately after generation
    - Store it securely in your environment variables
    - You won't be able to see it again

5. **Add to Environment**
    ```bash
    export GITHUB_TOKEN="ghp_your_token_here"
    ```

### Creating a Linear API Token

1. **Go to Linear Settings**
    - Visit [Linear Settings > API](https://linear.app/settings/api)
    - Or navigate: Linear → Settings → API

2. **Create New API Key**
    - Click "Create new API key"
    - Give it a descriptive name like "CLI Tool"
    - Copy the generated token

3. **Add to Environment**
    ```bash
    export LINEAR_API_TOKEN="lin_api_your_token_here"
    ```

### Permissions Summary

| Service | Required Permissions                       | Purpose                              |
| ------- | ------------------------------------------ | ------------------------------------ |
| GitHub  | `repo` (private) or `public_repo` (public) | Create/read PRs, push branches       |
| GitHub  | `workflow` (optional)                      | Update workflow files                |
| Linear  | API Key                                    | Read task details, get task metadata |

## Requirements

- Node.js 18+
- Git repository with GitHub remote
- Linear API access
- GitHub API access

## API Documentation

- [Linear SDK](https://linear.app/developers/sdk)
- [GitHub REST API](https://octokit.github.io/rest.js/v22/)
