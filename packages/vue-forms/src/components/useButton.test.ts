import { expect, mock, test } from 'bun:test';
import { createSSRApp, defineComponent, h } from 'vue';
import type { SetupContext } from 'vue';
import { renderToString } from 'vue/server-renderer';

import { useButton } from './useButton.js';

test('useButton swallows clicks while the busy prop is set', async () => {
    const onClick = mock();

    const busyButton = await renderButton({ busy: true, onClick });
    await busyButton.click(new Event('click', { cancelable: true }));
    expect(onClick).not.toHaveBeenCalled();

    const idleButton = await renderButton({ busy: false, onClick });
    await idleButton.click(new Event('click', { cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
});

test('the rendered button carries aria-busy only while busy', async () => {
    expect(await renderButtonHtml({ busy: true })).toContain('aria-busy="true"');
    expect(await renderButtonHtml({ busy: false })).not.toContain('aria-busy');
    expect(await renderButtonHtml({ busy: true, link: 'https://example.com' })).toContain('aria-busy="true"');
});

async function renderButtonHtml(props: { busy: boolean; link?: string }) {
    const Button = defineComponent({
        props: useButton.props,
        emits: useButton.emits,
        setup() {
            const button = useButton();
            const ctx: SetupContext = { attrs: {}, slots: {}, emit: () => {}, expose: () => {} };
            return () => button.Button({}, ctx);
        },
    });

    return await renderToString(createSSRApp({ render: () => h(Button, props) }));
}

async function renderButton(props: { busy: boolean; onClick: () => void }) {
    let button: ReturnType<typeof useButton> | undefined;
    const Button = defineComponent({
        props: useButton.props,
        emits: useButton.emits,
        setup() {
            button = useButton();
            return () => null;
        },
    });

    await renderToString(createSSRApp({ render: () => h(Button, props) }));

    return button!;
}
