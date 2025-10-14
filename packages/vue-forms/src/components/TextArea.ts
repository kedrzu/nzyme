import { defineComponent, h } from 'vue';

import { useTextArea } from './useTextArea.js';

/**
 *
 */
export const TextArea = /*@__PURE__*/ defineComponent({
    name: 'TextArea',
    props: useTextArea.props,
    emits: useTextArea.emits,
    setup() {
        const { TextArea } = useTextArea();
        return () => h(TextArea);
    },
});
