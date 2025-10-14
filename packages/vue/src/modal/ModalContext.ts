import { defineContext } from '@nzyme/vue-utils';

import type { ModalController } from './ModalTypes.js';

/**
 * Context for the modal.
 */
export const ModalContext = defineContext<ModalController>('Modal');
