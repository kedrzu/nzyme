import { expect, test } from 'bun:test';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';

import { useTextInput } from './useTextInput.jsx';

test('useTextInput renders no title tooltip unless the caller passes one', async () => {
    const labelled = await renderTextInput({});
    expect(labelled).toContain('aria-label="Name"');
    expect(labelled).not.toContain('title=');

    expect(await renderTextInput({ title: 'Your full name' })).toContain('title="Your full name"');
});

async function renderTextInput(attrs: { title?: string }) {
    const TextInputField = defineComponent({
        props: useTextInput.props,
        emits: useTextInput.emits,
        setup() {
            const { TextInput } = useTextInput();
            return () => h(TextInput, attrs);
        },
    });

    return await renderToString(createSSRApp({ render: () => h(TextInputField, { label: 'Name' }) }));
}
