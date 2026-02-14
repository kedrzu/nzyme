import { defineContext } from '@nzyme/vue-utils/context.js';

import type { ModalController } from './ModalTypes.js';

/**
 * Context for the modal.
 */
export const ModalContext = defineContext<ModalController>('Modal');
