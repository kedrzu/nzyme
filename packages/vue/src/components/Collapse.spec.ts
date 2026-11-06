import { describe, expect, onTestFinished, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-vue';
import { createSSRApp, h, reactive } from 'vue';
import { renderToString } from 'vue/server-renderer';

import Collapse from './Collapse.vue';

const CONTENT_HEIGHT = 120;

// `renderToString` runs in the test browser, so `isBrowser()` is switched off while it does to make
// the components take their server-side paths.
const environment = vi.hoisted(() => ({ ssr: false }));
vi.mock('@nzyme/dom-utils/isBrowser.js', () => ({ isBrowser: () => !environment.ssr }));

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

    describe.each(['always', 'lazy'] as const)('hydrated from SSR with `render="%s"` and hidden', renderMode => {
        test('renders the content hidden on the server', async () => {
            const { container } = await hydrateCollapse({ show: false, render: renderMode });

            expect(collapseElement().style.display).toBe('none');
            expect(container.dataset.ssrHtml).toContain('display:none');
        });

        test('shows the content with an animated height once shown, and hides it again', async () => {
            const { props, emitted } = await hydrateCollapse({ show: false, render: renderMode });

            props.show = true;
            await expect.poll(() => emitted.afterEnter).toBe(1);

            const element = collapseElement();
            expect(element.style.display).toBe('');
            expect(element.offsetHeight).toBe(CONTENT_HEIGHT);
            expect(emitted.heightChange).toEqual([CONTENT_HEIGHT]);
            await expect.element(page.getByTestId('content')).toBeVisible();

            props.show = false;
            await expect.poll(() => emitted.afterLeave).toBe(1);

            expect(emitted.heightChange).toEqual([CONTENT_HEIGHT, 0]);
            await expect.element(page.getByTestId('content')).not.toBeVisible();
        });
    });
});

/**
 * Renders Collapse to HTML the way a server would, then hydrates that HTML in the browser —
 * the path a prerendered page takes. Mutate the returned `props` to update the hydrated app.
 */
async function hydrateCollapse(initialProps: { show: boolean; render: 'always' | 'lazy' }) {
    const props = reactive({ ...initialProps });
    const emitted = { heightChange: [] as number[], afterEnter: 0, afterLeave: 0 };
    const app = () =>
        createSSRApp({
            render: () =>
                h(
                    Collapse,
                    {
                        ...props,
                        onHeightChange: (height: number) => emitted.heightChange.push(height),
                        onAfterEnter: () => emitted.afterEnter++,
                        onAfterLeave: () => emitted.afterLeave++,
                    },
                    () => h('div', { 'data-testid': 'content', style: { height: `${CONTENT_HEIGHT}px` } }, 'Content'),
                ),
        });

    environment.ssr = true;
    let html: string;
    try {
        html = await renderToString(app());
    } finally {
        environment.ssr = false;
    }

    const container = document.createElement('div');
    container.innerHTML = html;
    container.dataset.ssrHtml = html;
    document.body.append(container);

    const hydrated = app();
    hydrated.mount(container);
    onTestFinished(() => {
        hydrated.unmount();
        container.remove();
    });

    return { props, emitted, container };
}

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
