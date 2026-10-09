import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Package } from '@nzyme/project-utils/getPackages.js';
import { getPackages } from '@nzyme/project-utils/getPackages.js';
import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';

import { collectSymbols } from '../codeIndex/collectSymbols.js';
import { getIndexSettings } from '../codeIndex/IndexSettings.js';
import { readIndexConfig } from '../codeIndex/NzymeIndexConfig.js';
import { renderMarkdown } from '../codeIndex/renderMarkdown.js';
import { Command } from '../Command.js';

/**
 * Generates the repo's code index, so a coding agent has a fast, always-fresh map of the codebase
 * instead of re-deriving it by grepping every session (and reinventing utilities that already
 * exist). Crawls every workspace package for `defineX` DSL symbols, `@util` helpers, `.vue`
 * components and — when configured — database entities, then writes the resulting
 * `INDEX.md`/`UTILS.md` files (root + per-package). Purely regenerative — the output is meant to be
 * git-ignored and is safe to delete or re-run at any time; see `renderMarkdown` for the exact file
 * set, `collectSymbols` for what gets indexed and `NzymeIndexConfig` for the configuration.
 */
export class IndexCommand extends Command {
    static override paths = [['index']];

    static override usage = Command.Usage({
        category: 'Docs',
        description: 'Generate the code index (INDEX.md / UTILS.md) for agent navigation',
        details: `
            Crawls every workspace package for services, commands, factories, endpoints
            (\`defineService\`/\`defineCommand\`/\`defineFactory\`/\`defineEndpoint\`), \`.vue\`
            components (outside Nuxt apps) and \`@util\`-tagged helpers, then writes a root
            \`INDEX.md\` (package hub) plus one \`INDEX.md\` per package that has at least one
            symbol. Output is generated and should be git-ignored — safe to re-run any time.

            Configured by the \`nzyme.index\` field of the root package.json, all optional:
            \`globalUtilPackages\` (string[]) — packages whose \`@util\` helpers also go to a root
            \`UTILS.md\` (not written without any); \`defineKinds\` ({ kind, section, callee,
            nameKey?, order? }[]) — further \`defineX\` DSLs to index, e.g. \`{ "kind": "actor",
            "section": "Actors", "callee": "defineActor", "nameKey": "type", "order": 40 }\`;
            \`entities\` ({ tableFunctions: string[], packages?: string[] }) — table definitions to
            index as entities, e.g. \`{ "tableFunctions": ["pgTable"], "packages": ["@acme/database"] }\`.
        `,
        examples: [['Generate the code index', 'nzyme index']],
    });

    /**
     * Execute the command.
     */
    override async run() {
        const root = getProjectRoot();
        const [packages, config] = await Promise.all([getPackages(root), readIndexConfig(root)]);
        const settings = getIndexSettings(config);

        const symbols = await collectSymbols({
            root,
            packages,
            settings,
            onWarn: message => this.logger.warn(message),
        });
        const files = renderMarkdown({ root, packages, symbols, settings });

        for (const [filePath, data] of files) {
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, data);
        }

        // Drop index files this run no longer generates (a package lost its last symbol, or
        // `globalUtilPackages` was emptied), so a stale one never misleads an agent.
        const staleFiles = [join(root, 'UTILS.md'), ...packages.map(pkg => join(pkg.path, 'INDEX.md'))].filter(
            filePath => !files.has(filePath),
        );
        await Promise.all(staleFiles.map(filePath => rm(filePath, { force: true })));

        this.logger.info(`Wrote ${files.size} index files.`);
        this.warnMissingDescriptions(packages);

        return 0;
    }

    /** Warns once, in a single summary line, about named packages with no `description`. */
    private warnMissingDescriptions(packages: readonly Package[]): void {
        const names: string[] = [];
        for (const pkg of packages) {
            if (pkg.packageJson.name && !pkg.packageJson.description) {
                names.push(pkg.packageJson.name);
            }
        }

        if (names.length === 0) {
            return;
        }

        this.logger.warn(
            `${names.length} package(s) have no description (shown as "(no description)"): ${names.join(', ')}`,
        );
    }
}
