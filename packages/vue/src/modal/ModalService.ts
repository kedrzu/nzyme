import { clearFocus } from '@nzyme/dom-utils/clearFocus.js';
import { onHistoryBack } from '@nzyme/dom-utils/virtualHistory.js';
import { defineService } from '@nzyme/ioc/Service.js';
import type { Writable } from '@nzyme/types/Common.js';
import { arrayRemove } from '@nzyme/utils/array/arrayRemove.js';
import { CancelError } from '@nzyme/utils/CancelError.js';
import { createPromise } from '@nzyme/utils/createPromise.js';
import { isFunction } from '@nzyme/utils/isFunction.js';
import { provideContext } from '@nzyme/vue-utils/context.js';
import { onKeyUp } from '@nzyme/vue-utils/onKeyUp.js';
import { reactive } from '@nzyme/vue-utils/reactivity/reactive.js';
import type { RequiredKeysOf } from 'type-fest';
import { defineComponent, h, nextTick, ref } from 'vue';
import type { Component, ComponentInternalInstance, Ref } from 'vue';

import { ModalContext } from './ModalContext.js';
import type { Modal, ModalComponent, ModalController, ModalProps, ModalResult } from './ModalTypes.js';

/**
 * Options for opening a modal in the modal service.
 */
export interface ModalServiceOpenOptions {
    /**
     * To make context-based features like provide/inject work, you need to pass parent component instance
     */
    parent?: ComponentInternalInstance | null;
}

/**
 * Service for opening and closing modals.
 */
export const ModalService = defineService({
    name: 'ModalService',
    setup() {
        const modals = ref<Modal[]>([]);

        return reactive({
            open,
            closeAll,
            modals: modals as Readonly<Ref<readonly Modal[]>>,
        });

        /**
         * Opens a modal.
         * @param modal - Modal component.
         * @param props - Props for modal.
         * @param options - Options for modal.
         * @returns Promise with modal result that resolves when modal is closed.
         */
        function open<C>(modal: ModalComponent<C>, props: ModalProps<C>, options?: ModalServiceOpenOptions): Modal<C>;
        /**
         * Opens a modal.
         * @param modal - Modal component.
         * @param props - Props for modal.
         * @param options - Options for modal.
         * @returns Promise with modal result that resolves when modal is closed.
         */
        function open<C>(
            modal: RequiredKeysOf<ModalProps<C>> extends never ? ModalComponent<C> : never,
            props?: ModalProps<C>,
            options?: ModalServiceOpenOptions,
        ): Modal<C>;
        function open<C>(
            component: ModalComponent<C>,
            props?: ModalProps<C>,
            options?: ModalServiceOpenOptions,
        ): Modal<C> {
            type Controller = ModalController<ModalResult<C>>;
            const isOpen = ref(true);
            const modalPromise = createPromise<ModalResult<C>>();
            const modal = modalPromise.promise as Writable<Modal<C>>;
            const historyHandle = onHistoryBack(() => modal.controller.close());

            // When modal is opened, we want to clear focus from the previously focused element.
            clearFocus();

            modal.id = Symbol('modal');
            modal.props = props ?? ({} as ModalProps<C>);
            modal.controller = reactive<Controller>({
                open: isOpen,
                done: done as Controller['done'],
                close: close,
            });

            modal.component = defineComponent({
                async setup() {
                    provideContext(ModalContext, modal.controller as unknown as ModalController);
                    onKeyUp('Escape', handleClose);

                    const view = await unwrapModalComponent(component);

                    return () => {
                        const vnodeProps = {
                            ...modal.props,
                            modal: modal.controller,
                        };
                        const vnode = h(view, vnodeProps);
                        if (options?.parent) {
                            vnode.appContext = { ...options.parent.appContext };
                        }

                        return vnode;
                    };
                },
            });

            modals.value.push(modal as unknown as Modal);

            function done(result: ModalResult<C>) {
                if (!isOpen.value) {
                    return;
                }

                modalPromise.resolve(result);
                handleClose();
            }

            function close() {
                if (!isOpen.value) {
                    return;
                }

                modalPromise.reject(new CancelError());
                handleClose();
            }

            function handleClose() {
                isOpen.value = false;

                // Destroy the modal after a slight delay
                // This way you can use customized transitions.
                void nextTick(() => arrayRemove(modals.value, modal as unknown as Modal));
                historyHandle.cancel();
            }

            return modal;
        }

        function closeAll() {
            modals.value.forEach(m => m.controller.close());
        }

        /**
         * A `ModalComponent` is the component itself, a promise of its module, or a function that
         * loads it. Vue components can themselves be functions, so callability alone cannot tell a
         * functional component from a loader — this predicate states the contract `open()` documents
         * (a callable modal is the loader) in one named place instead of at every call site.
         */
        function isModalComponentLoader<C>(modal: ModalComponent<C>): modal is () => Promise<{ default: C }> {
            return isFunction(modal);
        }

        function unwrapModalComponent<C>(modal: ModalComponent<C>): Promise<Component> {
            if (modal instanceof Promise) {
                return modal.then(view => view.default as Component);
            }

            if (isModalComponentLoader(modal)) {
                return modal().then(view => view.default as Component);
            }

            return Promise.resolve(modal as Component);
        }
    },
});
