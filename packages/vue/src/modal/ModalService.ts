import { clearFocus, virtualHistory } from '@barebone/dom-utils';
import { type Ref, defineComponent, h, ref, type ComponentInternalInstance, nextTick } from 'vue';

import { defineService } from '@nzyme/ioc';
import type { Writable } from '@nzyme/types';
import { arrayRemove, createPromise } from '@nzyme/utils';

import type {
    ModalComponent,
    Modal,
    OpenModalOptions,
    ModalResult,
    ModalProps,
    ModalComponentView,
    ModalHandlerProps,
    ModalHandler,
} from './ModalTypes.js';
import { onKeyUp } from '../onKeyUp.js';
import { reactive } from '../reactivity/reactive.js';

interface ModalServiceOpenOptions {
    /**
     * To make context-based features like provide/inject work, you need to pass parent component instance
     */
    parent?: ComponentInternalInstance | null;
}

export const ModalService = defineService({
    name: 'ModalService',
    setup() {
        const modals = ref<Modal[]>([]);

        return reactive({
            open,
            closeAll,
            modals: modals as Readonly<Ref<readonly Modal[]>>,
        });

        function open<T extends ModalComponent>(
            options: OpenModalOptions<T> & ModalServiceOpenOptions,
        ): Modal<T> {
            const open = ref(true);
            const result = createPromise<ModalResult<T> | undefined>();

            let modalResult: ModalResult<T> | undefined;

            const modal = result.promise as Writable<Modal<T>>;
            const historyHandle = virtualHistory.pushState(() => modal.handler.close());

            // When modal is opened, we want to clear focus from the previously focused element.
            clearFocus();

            modal.id = Symbol('modal');
            modal.props = options.props as ModalProps<T>;
            modal.handler = reactive<ModalHandler<ModalResult<T>>>({
                open,
                setResult(result: ModalResult<T>) {
                    modalResult = result;
                },
                done(result) {
                    if (!open.value) {
                        return;
                    }

                    modalResult = result;
                    closeModal();
                },
                close: closeModal,
                cancel() {
                    if (!open.value) {
                        return;
                    }

                    modalResult = undefined;
                    closeModal();
                },
            });

            modal.component = defineComponent({
                async setup() {
                    const props: ModalHandlerProps<ModalResult<T>> = {
                        ...modal.props,
                        modal: modal.handler,
                    };

                    onKeyUp('Escape', closeModal);

                    const view = await unwrapModalComponent(options.modal);

                    return () => {
                        const vnode = h(view, props);
                        if (options.parent) {
                            vnode.appContext = { ...options.parent.appContext };
                        }

                        return vnode;
                    };
                },
            });

            modals.value.push(modal as Modal);

            return modal;

            function closeModal() {
                if (!open.value) {
                    return;
                }

                open.value = false;

                // Destroy the modal after a slight delay
                // This way you can use customized transitions.
                void nextTick(() => arrayRemove(modals.value, modal as Modal));

                historyHandle.cancel();

                result.resolve(modalResult);
            }
        }

        function closeAll() {
            modals.value.forEach(m => m.handler.close());
        }

        function unwrapModalComponent<T extends ModalComponent>(modal: ModalComponentView<T>) {
            if (modal instanceof Promise) {
                return modal.then(view => view.default);
            }

            if (modal instanceof Function) {
                return modal().then(view => view.default);
            }

            return Promise.resolve(modal);
        }
    },
});
