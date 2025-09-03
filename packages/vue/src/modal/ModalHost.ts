import { defineComponent, h } from 'vue';

import { useService } from '@nzyme/vue-ioc';

import { ModalService } from './ModalService.js';

/**
 *
 */
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
