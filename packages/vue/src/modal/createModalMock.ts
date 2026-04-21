import { reactive } from 'vue';

import type { ModalController } from './ModalTypes.js';

/**
 * Creates a mock modal controller for use in stories and tests.
 * The controller is reactive, so `open` can be toggled externally.
 */
export function createModalMock<T = void>(): ModalController<T> {
    const controller = reactive<ModalController<T>>({
        open: false,
        done() {
            controller.open = false;
        },
        close() {
            controller.open = false;
        },
    });

    return controller as ModalController<T>;
}
