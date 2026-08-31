import { defineComponent, h } from 'vue';

import { useTextArea } from './useTextArea.js';

/** Auto-resizing textarea component backed by the useTextArea composable. */
export const TextArea = /*@__PURE__*/ defineComponent({
    name: 'TextArea',
    props: useTextArea.props,
    emits: useTextArea.emits,
    setup() {
        const { TextArea: renderTextArea } = useTextArea();
        return () => h(renderTextArea);
    },
});
