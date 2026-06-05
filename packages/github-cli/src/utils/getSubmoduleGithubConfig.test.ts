import { expect, test } from 'bun:test';

import type { GithubConfig } from '../GithubConfig.js';
import { getSubmoduleGithubConfig } from './getSubmoduleGithubConfig.js';

const TOKEN = 'ghp_test';

const EXPECTED: GithubConfig = {
    owner: 'acme',
    repo: 'widgets',
    token: TOKEN,
};

test('parses an https URL with a .git suffix', () => {
    expect(getSubmoduleGithubConfig('https://github.com/acme/widgets.git', TOKEN)).toEqual(EXPECTED);
});

test('parses an https URL without a .git suffix', () => {
    expect(getSubmoduleGithubConfig('https://github.com/acme/widgets', TOKEN)).toEqual(EXPECTED);
});

test('parses an ssh (git@) URL', () => {
    expect(getSubmoduleGithubConfig('git@github.com:acme/widgets.git', TOKEN)).toEqual(EXPECTED);
});

test('returns null for a non-GitHub URL', () => {
    expect(getSubmoduleGithubConfig('https://gitlab.com/acme/widgets.git', TOKEN)).toBeNull();
});

test('returns null for junk input', () => {
    expect(getSubmoduleGithubConfig('not-a-url', TOKEN)).toBeNull();
});
