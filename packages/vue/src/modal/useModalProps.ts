import { defineProp } from '@nzyme/vue-utils';

import type { ModalHandler } from './ModalTypes.js';

/**
 *
 */
export function useModalProps<T = void>() {
    return {
        modal: defineProp<ModalHandler<T>>({ required: true }),
    };
}
