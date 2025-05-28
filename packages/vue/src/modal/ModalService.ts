import { defineComponent, h, nextTick, ref, watch } from 'vue';
import type { ComponentInternalInstance, Ref } from 'vue';

import { clearFocus, onHistoryBack } from '@nzyme/dom-utils';
import { defineService } from '@nzyme/ioc';
import type { Writable } from '@nzyme/types';
import { arrayRemove, CancelError, createPromise } from '@nzyme/utils';
import { onKeyUp, provideContext, reactive } from '@nzyme/vue-utils';

import { ModalContext } from './ModalContext.js';
import type {
    Modal,
    ModalComponent,
    ModalComponentView,
    ModalHandler,
    ModalHandlerProps,
    ModalProps,
    ModalResult,
    OpenModalOptions,
} from './ModalTypes.js';

interface ModalServiceOpenOptions {
    /**
     * To make context-based features like provide/inject work, you need to pass parent component instance
     */
    parent?: ComponentInternalInstance | null;
}

export /**
 *
 */
const ModalService = defineService({
    name: 'ModalService',
    setup() {
        const modals = ref<Modal[]>([]);

        return reactive({
            open,
            closeAll,
            modals: modals as Readonly<Ref<readonly Modal[]>>,
        });

        function open<T extends ModalComponent>(options: ModalServiceOpenOptions & OpenModalOptions<T>): Modal<T> {
            const open = ref(true);
            const result = createPromise<ModalResult<T>>();

            /**
             *
             */
            type ModalResultState = {
                /**
                 *
                 */
                result: ModalResult<T>;
            };

            let modalResult: ModalResultState | undefined;

            const modal = result.promise as Writable<Modal<T>>;
            const historyHandle = onHistoryBack(() => modal.handler.close());

            // When modal is opened, we want to clear focus from the previously focused element.
            clearFocus();

            modal.id = Symbol('modal');
            modal.props = options.props as ModalProps<T>;
            modal.handler = reactive<ModalHandler<ModalResult<T>>>({
                open,
                setResult: result => {
                    modalResult = { result };
                },
                done: setDone as ModalHandler<ModalResult<T>>['done'],
                close: closeModal,
                cancel: () => {
                    if (!open.value) {
                        return;
                    }

                    modalResult = undefined;
                    closeModal();
                },
            });

            watch(open, value => {
                if (value) {
                    return;
                }

                // Destroy the modal after a slight delay
                // This way you can use customized transitions.
                void nextTick(() => arrayRemove(modals.value, modal as unknown as Modal));

                historyHandle.cancel();

                if (modalResult) {
                    result.resolve(modalResult.result);
                } else {
                    result.reject(new CancelError());
                }
            });

            modal.component = defineComponent({
                async setup() {
                    const props: ModalHandlerProps<ModalResult<T>> = {
                        ...modal.props,
                        modal: modal.handler,
                    };

                    provideContext(ModalContext, modal.handler as unknown as ModalHandler<unknown>);
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

            modals.value.push(modal as unknown as Modal);

            function closeModal() {
                open.value = false;
            }

            function setDone(result: ModalResult<T>) {
                if (!open.value) {
                    return;
                }

                modalResult = { result };
                closeModal();
            }

            return modal;
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
