import { describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-vue';
import { h } from 'vue';

import Collapse from './Collapse.vue';

const CONTENT_HEIGHT = 120;

/** The element's state captured synchronously in each `heightChange` handler, i.e. mid-transition. */
interface HeightChangeSnapshot {
    emitted: number;
    inlineHeight: string;
    opacity: string;
    transitionProperty: string;
}

describe('Collapse', () => {
    test('animates the height from zero to the content height on show and clears it after', async () => {
        const { snapshots, screen } = await renderCollapse({ show: false });

        await screen.rerender({ show: true });
        await expect.poll(() => screen.emitted('afterEnter')).toHaveLength(1);

        const element = collapseElement();
        expect(snapshots).toEqual([
            {
                emitted: CONTENT_HEIGHT,
                inlineHeight: `${CONTENT_HEIGHT}px`,
                opacity: '1',
                transitionProperty: expect.stringContaining('height'),
            },
        ]);
        expect(element.style.height).toBe('');
        expect(element.style.overflow).toBe('');
        expect(screen.emitted('heightChange')).toEqual([[CONTENT_HEIGHT]]);
    });

    test('animates the height to zero on hide, clears it and emits afterLeave', async () => {
        const { snapshots, screen } = await renderCollapse({ show: false });
        await screen.rerender({ show: true });
        await expect.poll(() => screen.emitted('afterEnter')).toHaveLength(1);

        // Without `render="always"` the element is removed after leaving, so keep a reference.
        const element = collapseElement();
        await screen.rerender({ show: false });
        await expect.poll(() => screen.emitted('afterLeave')).toHaveLength(1);

        expect(snapshots.map(snapshot => [snapshot.emitted, snapshot.inlineHeight])).toEqual([
            [CONTENT_HEIGHT, `${CONTENT_HEIGHT}px`],
            [0, '0px'],
        ]);
        expect(element.style.height).toBe('');
        expect(screen.emitted('heightChange')).toEqual([[CONTENT_HEIGHT], [0]]);
    });

    test('fades the content in when `fade` is set', async () => {
        const { snapshots, screen } = await renderCollapse({ show: false, fade: true });

        await screen.rerender({ show: true });
        await expect.poll(() => screen.emitted('afterEnter')).toHaveLength(1);

        expect(snapshots.map(snapshot => snapshot.opacity)).toEqual(['0']);
        expect(getComputedStyle(collapseElement()).opacity).toBe('1');
    });

    test('with `render="lazy"` does not render the content until first shown, and removes it after hiding', async () => {
        const { screen } = await renderCollapse({ show: false, render: 'lazy' });

        await expect.element(page.getByTestId('content')).not.toBeInTheDocument();

        await screen.rerender({ show: true });
        await expect.element(page.getByTestId('content')).toBeVisible();

        await screen.rerender({ show: false });
        await expect.poll(() => screen.emitted('afterLeave')).toHaveLength(1);
        await expect.element(page.getByTestId('content')).not.toBeInTheDocument();
    });

    test('with `render="always"` renders the hidden content and toggles its visibility', async () => {
        const { screen } = await renderCollapse({ show: false, render: 'always' });

        await expect.element(page.getByTestId('content')).toBeInTheDocument();
        await expect.element(page.getByTestId('content')).not.toBeVisible();

        await screen.rerender({ show: true });
        await expect.poll(() => screen.emitted('afterEnter')).toHaveLength(1);
        await expect.element(page.getByTestId('content')).toBeVisible();

        const leavesBefore = screen.emitted('afterLeave')?.length ?? 0;
        await screen.rerender({ show: false });
        await expect.poll(() => screen.emitted('afterLeave')).toHaveLength(leavesBefore + 1);
        await expect.element(page.getByTestId('content')).toBeInTheDocument();
        await expect.element(page.getByTestId('content')).not.toBeVisible();
    });
});

async function renderCollapse(props: { show: boolean; fade?: boolean; render?: 'always' | 'lazy' }) {
    const snapshots: HeightChangeSnapshot[] = [];
    const screen = await render(Collapse, {
        // `@vue/test-utils` (under `vitest-browser-vue`) stubs `<Transition>` by default, which skips
        // every transition hook this component is built on.
        global: { stubs: { transition: false } },
        props: {
            ...props,
            onHeightChange: (height: number) => {
                const element = collapseElement();
                const style = getComputedStyle(element);
                snapshots.push({
                    emitted: height,
                    inlineHeight: element.style.height,
                    opacity: style.opacity,
                    transitionProperty: style.transitionProperty,
                });
            },
        },
        slots: {
            default: () => h('div', { 'data-testid': 'content', style: { height: `${CONTENT_HEIGHT}px` } }, 'Content'),
        },
    });

    return { snapshots, screen };
}

function collapseElement() {
    return page.getByTestId('content').element().parentElement!;
}
