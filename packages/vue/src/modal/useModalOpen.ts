import { arrayRemove } from '@nzyme/utils/array/arrayRemove.js';
import { useService } from '@nzyme/vue-ioc/useService.js';
import type { RequiredKeysOf } from 'type-fest';
import { getCurrentInstance, onUnmounted } from 'vue';

import { ModalService } from './ModalService.js';
import type { Modal, ModalComponent, ModalProps } from './ModalTypes.js';

/**
 * Options for useModalOpen.
 */
export interface UseModalOpenOptions {
    /**
     * Close all open modals when component is unmounted.
     * @default true
     */
    closeOnUnmounted?: boolean;
}

/**
 * Opens a modal.
 */
export function useModalOpen(opts?: UseModalOpenOptions) {
    const instance = getCurrentInstance();
    const modalService = useService(ModalService);
    const localModals: Modal[] = [];

    const closeOnUnmounted = opts?.closeOnUnmounted ?? false;
    if (closeOnUnmounted && instance) {
        onUnmounted(() => {
            localModals.forEach(m => m.controller.close());
        });
    }

    return open;

    /**
     * Opens a modal.
     * @param modal - Modal component.
     * @param props - Props for modal.
     * @returns Promise with modal result that resolves when modal is closed.
     */
    function open<C>(modal: ModalComponent<C>, props: ModalProps<C>): Modal<C>;
    /**
     * Opens a modal.
     * @param modal - Modal component.
     * @param props - Props for modal.
     * @returns Promise with modal result that resolves when modal is closed.
     */
    function open<C>(
        modal: RequiredKeysOf<ModalProps<C>> extends never ? ModalComponent<C> : never,
        props?: ModalProps<C>,
    ): Modal<C>;
    function open<C>(modal: ModalComponent<C>, props?: ModalProps<C>): Modal<C> {
        const modalPromise = modalService.open(modal, props ?? ({} as ModalProps<C>), { parent: instance });

        if (closeOnUnmounted) {
            localModals.push(modalPromise);
            // Remove modal from local ones when it is closed.
            void modalPromise.finally(() => arrayRemove(localModals, modalPromise));
        }

        return modalPromise;
    }
}
