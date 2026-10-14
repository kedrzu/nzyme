import { expect, mock, test } from 'bun:test';
import { createSSRApp, defineComponent, h } from 'vue';
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
