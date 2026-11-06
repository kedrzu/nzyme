import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-vue';
import { h, ref } from 'vue';
import type { ComponentPublicInstance } from 'vue';

import { Reveal } from './Reveal.jsx';

const DURATION = 50;

type RevealEvent = 'beforeEnter' | 'enter' | 'afterEnter' | 'beforeLeave' | 'leave' | 'afterLeave';

/** The wrapper's and the transitioning element's state, captured synchronously in a Reveal event handler. */
interface RevealSnapshot {
    event: RevealEvent;
    wrapperHeight: string;
    wrapperOverflow: string;
    wrapperTransitionProperty: string;
    /** Computed `position` of the leaving element, captured in `leave`. */
    leavingPosition?: string;
}

describe('Reveal', () => {
    test('animates the wrapper height when the slot content is swapped, and clears it after', async () => {
        const { content, snapshots, screen } = await renderReveal('short');

        content.value = 'tall';
        await expect.poll(() => screen.emitted('afterEnter')).toHaveLength(1);
        await expect.poll(() => screen.emitted('afterLeave')).toHaveLength(1);

        expect(snapshots).toEqual([
            {
                event: 'beforeLeave',
                wrapperHeight: '40px',
                wrapperOverflow: 'hidden',
                wrapperTransitionProperty: expect.stringContaining('height'),
            },
            {
                event: 'leave',
                wrapperHeight: '40px',
                wrapperOverflow: 'hidden',
                wrapperTransitionProperty: expect.stringContaining('height'),
                // The leaving content overlays the entering one instead of stacking under it.
                leavingPosition: 'absolute',
            },
            expect.objectContaining({ event: 'beforeEnter' }),
            {
                event: 'enter',
                wrapperHeight: '100px',
                wrapperOverflow: 'hidden',
                wrapperTransitionProperty: expect.stringContaining('height'),
            },
            expect.objectContaining({ event: 'afterLeave' }),
            expect.objectContaining({ event: 'afterEnter' }),
        ]);

        const wrapper = wrapperElement(screen.container);
        expect(wrapper.style.height).toBe('');
        expect(wrapper.style.overflow).toBe('');
        expect(wrapper.getBoundingClientRect().height).toBe(100);
    });

    test('emits all six transition events with the component instance', async () => {
        const { content, screen } = await renderReveal('short');

        content.value = 'tall';
        await expect.poll(() => screen.emitted('afterEnter')).toHaveLength(1);
        await expect.poll(() => screen.emitted('afterLeave')).toHaveLength(1);

        const events: RevealEvent[] = ['beforeEnter', 'enter', 'afterEnter', 'beforeLeave', 'leave', 'afterLeave'];
        const payloads = events.map(event => screen.emitted<[ComponentPublicInstance]>(event));
        for (const payload of payloads) {
            expect(payload).toHaveLength(1);
        }

        const instance = payloads[0]![0]![0];
        expect(instance.$el).toBe(wrapperElement(screen.container));
        for (const payload of payloads) {
            expect(payload![0]![0]).toBe(instance);
        }
    });

    test('sets `--reveal-duration` from `duration`', async () => {
        const { screen } = await renderReveal('short');
        const wrapper = wrapperElement(screen.container);

        expect(wrapper.style.getPropertyValue('--reveal-duration')).toBe(`${DURATION}ms`);
        expect(getComputedStyle(wrapper).transitionDuration).toBe(`${DURATION / 1000}s`);
    });

    test('without `duration` leaves `--reveal-duration` unset and uses the default duration', async () => {
        const { screen } = await renderReveal('short', null);
        const wrapper = wrapperElement(screen.container);

        expect(wrapper.style.getPropertyValue('--reveal-duration')).toBe('');
        expect(getComputedStyle(wrapper).transitionDuration).toBe('0.2s');
    });

    test('animates from and to an empty slot', async () => {
        const { content, snapshots, screen } = await renderReveal('none');
        expect(wrapperElement(screen.container).getBoundingClientRect().height).toBe(0);

        content.value = 'tall';
        await expect.poll(() => screen.emitted('afterEnter')).toHaveLength(1);
        expect(snapshots.find(snapshot => snapshot.event === 'enter')?.wrapperHeight).toBe('100px');
        expect(wrapperElement(screen.container).getBoundingClientRect().height).toBe(100);

        snapshots.length = 0;
        content.value = 'none';
        await expect.poll(() => screen.emitted('afterLeave')).toHaveLength(2);
        expect(snapshots.find(snapshot => snapshot.event === 'beforeLeave')?.wrapperHeight).toBe('100px');
        expect(snapshots.find(snapshot => snapshot.event === 'enter')?.wrapperHeight).toBe('0px');

        await expect.poll(() => screen.emitted('afterEnter')).toHaveLength(2);
        const wrapper = wrapperElement(screen.container);
        expect(wrapper.style.height).toBe('');
        expect(wrapper.getBoundingClientRect().height).toBe(0);
    });
});

async function renderReveal(initial: 'none' | 'short' | 'tall', duration: number | null = DURATION) {
    const content = ref(initial);
    const snapshots: RevealSnapshot[] = [];

    const snapshot = (event: RevealEvent) => (vm: ComponentPublicInstance) => {
        const wrapper = vm.$el as HTMLElement;
        const entry: RevealSnapshot = {
            event,
            wrapperHeight: wrapper.style.height,
            wrapperOverflow: wrapper.style.overflow,
            wrapperTransitionProperty: getComputedStyle(wrapper).transitionProperty,
        };
        if (event === 'leave') {
            const leaving = wrapper.querySelector('[data-content="short"], [data-content="tall"]');
            entry.leavingPosition = leaving ? getComputedStyle(leaving).position : 'missing';
        }
        snapshots.push(entry);
    };

    const screen = await render(Reveal, {
        // `@vue/test-utils` (under `vitest-browser-vue`) stubs `<Transition>` by default, which skips
        // every transition hook this component is built on.
        global: { stubs: { transition: false } },
        props: {
            duration: duration ?? undefined,
            onBeforeEnter: snapshot('beforeEnter'),
            onEnter: snapshot('enter'),
            onAfterEnter: snapshot('afterEnter'),
            onBeforeLeave: snapshot('beforeLeave'),
            onLeave: snapshot('leave'),
            onAfterLeave: snapshot('afterLeave'),
        },
        slots: {
            default: () =>
                content.value === 'none'
                    ? undefined
                    : h('div', {
                          key: content.value,
                          'data-content': content.value,
                          style: { height: content.value === 'short' ? '40px' : '100px' },
                      }),
        },
    });

    return { content, snapshots, screen };
}

function wrapperElement(container: HTMLElement) {
    return container.firstElementChild as HTMLElement;
}
