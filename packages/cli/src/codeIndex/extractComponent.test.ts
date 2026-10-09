import { describe, expect, it } from 'bun:test';

import { extractComponent } from './extractComponent.js';
import type { IndexSymbol } from './IndexSymbol.js';

function extract(fileName: string, content: string): IndexSymbol[] {
    return extractComponent({
        packageName: '@acme/ui',
        relPath: `packages/ui/src/${fileName}`,
        importPath: `@acme/ui/${fileName}`,
        fileName,
        content,
    });
}

describe('extractComponent', () => {
    it('extracts a component with a leading HTML comment as description', () => {
        const symbols = extract(
            'ExternalLink.vue',
            [
                '<!--',
                '    This component is used to navigate to external links.',
                '    Allows to preserve scroll position when navigating back.',
                ' -->',
                '<script lang="ts" setup></script>',
                '<template><a /></template>',
            ].join('\n'),
        );

        expect(symbols).toEqual([
            {
                kind: 'component',
                packageName: '@acme/ui',
                exportName: 'ExternalLink',
                importPath: '@acme/ui/ExternalLink.vue',
                internalName: null,
                description:
                    'This component is used to navigate to external links. Allows to preserve scroll position when navigating back.',
                signature: null,
                relPath: 'packages/ui/src/ExternalLink.vue',
            },
        ]);
    });

    it('extracts a component with null description when it starts directly with a script block', () => {
        const symbols = extract(
            'InfoBox.vue',
            ['<script lang="ts" setup>', 'defineProps<Props>();', '</script>', '<template><div /></template>'].join(
                '\n',
            ),
        );

        expect(symbols).toEqual([
            {
                kind: 'component',
                packageName: '@acme/ui',
                exportName: 'InfoBox',
                importPath: '@acme/ui/InfoBox.vue',
                internalName: null,
                description: null,
                signature: null,
                relPath: 'packages/ui/src/InfoBox.vue',
            },
        ]);
    });

    it('ignores an HTML comment that appears inside the template (not at the top)', () => {
        const symbols = extract(
            'Widget.vue',
            [
                '<script setup></script>',
                '<template>',
                '  <!-- a comment inside the template -->',
                '  <div />',
                '</template>',
            ].join('\n'),
        );

        expect(symbols).toMatchObject([{ exportName: 'Widget', description: null }]);
    });

    it('derives the export name from the file name without extension', () => {
        const symbols = extract('SearchDropdown.vue', '<template></template>');

        expect(symbols[0]?.exportName).toBe('SearchDropdown');
    });
});
