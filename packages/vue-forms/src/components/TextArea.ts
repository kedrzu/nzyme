import { defineComponent } from 'vue';

import { useTextArea } from './useTextArea.js';

/*#__NO_SIDE_EFFECTS__*/
export const TextArea = defineComponent({
    name: 'TextArea',
    props: useTextArea.props,
    emits: useTextArea.emits,
    setup() {
        const { component } = useTextArea();
        return component;
    },
});
