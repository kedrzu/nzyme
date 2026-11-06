import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { lineOf, useOxlintHarness } from './oxlintTestHarness.js';

/**
 * End-to-end coverage through the real `oxlint` binary, spawned by `oxlintTestHarness.ts`
 * (`RuleTester` does not work under Bun). The fixture config extends the real preset, so the
 * `overrides` entry that scopes the rule to stories is what is tested, not a copy of it.
 */
const RULE_CODE = 'nzyme(no-aria-on-component-in-story)';

const PRESET_PATH = join(import.meta.dir, '..', '..', 'eslint', 'oxlintrc.json');

const STORY = `export const Default = () => (
    <div>
        <Button aria-label="Close" />
        <Foo.Bar aria-hidden="true" />
        <button aria-label="Close" />
        <my-el aria-label="Close" />
        <svg:rect aria-label="Close" />
    </div>
);
`;

const { lint } = useOxlintHarness({ config: { extends: [PRESET_PATH] }, ruleCode: RULE_CODE });

describe('nzyme/no-aria-on-component-in-story', () => {
    it('reports aria attributes on components and member-expression components, not on native elements', async () => {
        const diagnostics = await lint({ 'case.stories.tsx': STORY });

        expect(diagnostics.map(diagnostic => diagnostic.labels[0]?.span.line)).toEqual([
            lineOf(STORY, '<Button'),
            lineOf(STORY, '<Foo.Bar'),
        ]);
        expect(diagnostics[0]?.message).toContain('`aria-label`');
        expect(diagnostics[0]?.message).toContain('`<Button>`');
        expect(diagnostics[1]?.message).toContain('`aria-hidden`');
        expect(diagnostics[1]?.message).toContain('`<Foo.Bar>`');
    });

    it('says to fix the component and to use a prop with a translated default', async () => {
        const [diagnostic] = await lint({ 'case.stories.tsx': STORY });

        expect(diagnostic?.message).toContain('Fix the component rather than the story');
        expect(diagnostic?.message).toContain('prop with a translated default');
    });

    it('ignores a file that is not a story', async () => {
        expect(await lint({ 'case.tsx': STORY })).toEqual([]);
    });
});
