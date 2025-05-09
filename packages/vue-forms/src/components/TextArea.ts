import { defineComponent } from 'vue';

import { useTextArea } from './useTextArea.js';

/**
 *
 */
export const TextArea = /*@__PURE__*/ defineComponent({
    name: 'TextArea',
    props: useTextArea.props,
    emits: useTextArea.emits,
    setup() {
        const { component } = useTextArea();
        return component;
    },
});
