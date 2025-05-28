import type { ComponentOptions } from 'vue';

import type { EmptyObject, Flatten } from '@nzyme/types';
import type { ComponentProps } from '@nzyme/vue-utils';

/**
 *
 */
export type ModalHandlerProps<TResult> = {
    /**
     *
     */
    modal: ModalHandler<TResult>;
};

/**
 *
 */
export type ModalComponent<TProps extends ModalHandlerProps<any> = any> = ComponentOptions<TProps>;

/**
 *
 */
export type ModalComponentView<T extends ModalComponent> =
    | (() => Promise<{ default: T }>)
    | Promise<{ default: T }>
    | T;

/**
 *
 */
export type ModalProps<T extends ModalComponent> = keyof ModalPropsWithoutHandler<T> extends never
    ? undefined
    : ModalPropsWithoutHandler<T>;

/**
 *
 */
export type ModalResult<T extends ModalComponent> = ComponentProps<T> extends ModalHandlerProps<infer R> ? R : void;

/**
 *
 */
export interface ModalHandler<T = unknown> {
    /**
     *
     */
    setResult(this: void, result: T): void;
    /**
     *
     */
    done: T extends void ? () => void : (result: T) => void;
    /**
     *
     */
    close(this: void): void;
    /**
     *
     */
    cancel(this: void): void;
    /**
     *
     */
    open: boolean;
}

/**
 *
 */
export type OpenModalOptions<T extends ModalComponent = ModalComponent> =
    ModalProps<T> extends void ? OpenModalOptionsWithoutProps<T> : OpenModalOptionsWithProps<T>;

/**
 *
 */
export interface Modal<T extends ModalComponent = ModalComponent> extends Promise<ModalResult<T>> {
    /**
     *
     */
    readonly id: symbol;
    /**
     *
     */
    readonly handler: ModalHandler<ModalResult<T>>;
    /**
     *
     */
    readonly props: ModalProps<T>;
    /**
     *
     */
    readonly component: ComponentOptions;
}

type ModalPropsWithoutHandler<T extends ModalComponent> = Flatten<Omit<ComponentProps<T>, 'modal'>>;

type OpenModalOptionsBase<T extends ModalComponent = ModalComponent> = {
    /**
     * Modal component to be opened.
     * Supports asynchronous components loaded with `import(...)`.
     */
    modal: ModalComponentView<T>;
};

interface OpenModalOptionsWithoutProps<T extends ModalComponent> extends OpenModalOptionsBase<T> {
    props?: EmptyObject | undefined;
}

interface OpenModalOptionsWithProps<T extends ModalComponent> extends OpenModalOptionsBase<T> {
    /** Props to pass to the modal. */
    props: ModalProps<T>;
}
