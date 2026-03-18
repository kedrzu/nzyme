import { useService } from '@nzyme/vue-ioc/useService.js';
import { defineComponent, h } from 'vue';

import { ModalService } from './ModalService.js';

/** Renders active modals from the ModalService, supporting a custom slot or default rendering. */
export const ModalHost = defineComponent({
    name: 'ModalHost',
    setup(_props, ctx) {
        const modalService = useService(ModalService);

        return () => {
            const modals = modalService.modals;
            const slot = ctx.slots.default;
            if (slot) {
                return slot(modals);
            }

            return modals.map(modal => h(modal.component));
        };
    },
});
