import { expect, test } from 'bun:test';

import { fingerprintBunLock } from './fingerprintBunLock.js';

// Fragments of a real product `bun.lock`, in bun's own text format (trailing commas included).
const CONFIG_WORKSPACE = `
    "nzyme/packages/config": {
      "name": "@nzyme/config",
      "version": "0.16.0",
      "dependencies": {
        "@nzyme/ioc": "workspace:*",
        "@nzyme/logging": "workspace:*",
        "@nzyme/types": "workspace:*",
      },
    },`;

const CONTENT_TYPE = `
    "content-type": ["content-type@3.1.1", "", {}, "sha512-GW4qUsfFo59d0HbUibDlWv5wPz+vAAcaTWbKIuKCf0JkC7wWkSyf8f13IpXn5JkeMlB2P8iTSSIjwXljorg2vA=="],`;

const PACKAGES = `
    "@adobe/css-tools": ["@adobe/css-tools@4.5.0", "", {}, "sha512-6OzddxPio9UiWTCemp4N8cYLV2ZN1ncRnV1cVGtve7dhPOtRkleRyx32GQCYSwDYgaHU3USMm84tNsvKzRCa1Q=="],

    "@nzyme/config": ["@nzyme/config@workspace:nzyme/packages/config"],
${CONTENT_TYPE}`;

const OVERRIDES = `
    "playwright": "1.65.0",
    "vue": "3.5.45",`;

const PATCHED = `
    "bun-types@1.4.4": "patches/bun-types@1.4.4.patch",`;

const BASE = lock({ workspaces: CONFIG_WORKSPACE, packages: PACKAGES });

test('a bump of workspace versions and workspace dependency lists keeps the fingerprint', () => {
    // A submodule bump: every workspace package's version moves and one drops a workspace dependency.
    const bumped = lock({
        workspaces: CONFIG_WORKSPACE.replace('"0.16.0"', '"0.17.0"').replace(
            '        "@nzyme/logging": "workspace:*",\n',
            '',
        ),
        packages: PACKAGES,
    });
    // A new workspace package: its workspace entry and its `packages` entry.
    const added = lock({
        workspaces: `${CONFIG_WORKSPACE}
    "nzyme/packages/secrets": {
      "name": "@nzyme/secrets",
      "version": "0.17.0",
    },`,
        packages: `${PACKAGES}
    "@nzyme/secrets": ["@nzyme/secrets@workspace:nzyme/packages/secrets"],`,
    });

    expect(bumped).not.toBe(BASE);
    expect(fingerprintBunLock(bumped)).toBe(fingerprintBunLock(BASE));
    expect(fingerprintBunLock(added)).toBe(fingerprintBunLock(BASE));
});

test('a new or re-resolved external package changes the fingerprint', () => {
    const added = lock({
        workspaces: CONFIG_WORKSPACE,
        packages: `${PACKAGES}
    "@anthropic-ai/sdk": ["@anthropic-ai/sdk@0.129.0", "", { "dependencies": { "json-schema-to-ts": "^3.1.1", "standardwebhooks": "^1.0.0" }, "peerDependencies": { "zod": "^3.25.0 || ^4.0.0" }, "optionalPeers": ["zod"], "bin": { "anthropic-ai-sdk": "bin/cli" } }, "sha512-MH7LB20kNpGLUpPTe2OG5XvL/KhX8HUO9XyBaFjgFk6TLS4Xjt0VPIuMKywe7POKKPslX+QxSlVok9e+8kG5Nw=="],`,
    });
    const changed = lock({
        workspaces: CONFIG_WORKSPACE,
        packages: PACKAGES.replace(
            CONTENT_TYPE,
            `
    "content-type": ["content-type@1.0.5", "", {}, "sha512-nTjqfcBFEipKdXCv4YDQWCfmcLZKm81ldF0pAopTvyrFGVbcR6P/VAAd5G7N+0tTr8QqiU0tFadD6FK4NtJwOA=="],`,
        ),
    });

    expect(fingerprintBunLock(added)).not.toBe(fingerprintBunLock(BASE));
    expect(fingerprintBunLock(changed)).not.toBe(fingerprintBunLock(BASE));
});

test('a changed override or patched dependency changes the fingerprint', () => {
    const base = lock({ workspaces: CONFIG_WORKSPACE, packages: PACKAGES, overrides: OVERRIDES, patched: PATCHED });
    const override = lock({
        workspaces: CONFIG_WORKSPACE,
        packages: PACKAGES,
        overrides: OVERRIDES.replace('"3.5.45"', '"3.5.46"'),
        patched: PATCHED,
    });
    const patch = lock({
        workspaces: CONFIG_WORKSPACE,
        packages: PACKAGES,
        overrides: OVERRIDES,
        patched: `${PATCHED}
    "vue@3.5.45": "patches/vue@3.5.45.patch",`,
    });

    expect(fingerprintBunLock(override)).not.toBe(fingerprintBunLock(base));
    expect(fingerprintBunLock(patch)).not.toBe(fingerprintBunLock(base));
});

test('text that is not a bun.lock has no fingerprint', () => {
    expect(fingerprintBunLock('{ "packages": ')).toBeNull();
    expect(fingerprintBunLock('{ "lockfileVersion": 1 }')).toBeNull();
});

interface LockSections {
    workspaces: string;
    packages: string;
    overrides?: string;
    patched?: string;
}

/** A `bun.lock` text in bun's layout, from the given sections. */
function lock(sections: LockSections): string {
    return `{
  "lockfileVersion": 1,
  "configVersion": 1,
  "workspaces": {${sections.workspaces}
  },${sections.patched === undefined ? '' : `\n  "patchedDependencies": {${sections.patched}\n  },`}${sections.overrides === undefined ? '' : `\n  "overrides": {${sections.overrides}\n  },`}
  "packages": {${sections.packages}
  },
}
`;
}
