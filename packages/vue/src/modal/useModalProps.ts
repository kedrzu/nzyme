import { defineProp } from '@nzyme/vue-utils/defineProp.js';

import type { ModalController } from './ModalTypes.js';

/**
 * Base props for a modal.
 */
export interface ModalPropsBase<R = void> {
    /**
     * Modal controller.
     */
    modal: ModalController<R>;
}

/** Returns the prop definitions for a modal component, including the required modal controller. */
export function useModalProps<R = void>() {
    return {
        modal: defineProp<ModalController<R>>({ required: true }),
    };
}
