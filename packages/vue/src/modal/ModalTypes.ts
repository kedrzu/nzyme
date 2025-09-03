import type { Component, ComponentProps } from '@nzyme/vue-utils';

import type { ModalPropsBase } from './useModalProps.js';

/**
 * Modal component.
 */
export type ModalComponent<C> = (() => Promise<{ default: C }>) | C | Promise<{ default: C }>;

/**
 * Props of a modal.
 */
export type ModalProps<C> = Omit<ComponentProps<C>, 'modal'>;

/**
 * Result of a modal.
 */
export type ModalResult<C> = ComponentProps<C> extends ModalPropsBase<infer T> ? T : void;

/**
 * Modal controller.
 */
export interface ModalController<T = unknown> {
    /**
     * Close and mark the modal as done.
     */
    done: ModalDone<T>;
    /**
     * Close the modal.
     */
    close: ModalClose;
    /**
     * Whether the modal is open.
     */
    open: boolean;
}

/**
 * Modal close function.
 */
export type ModalClose = () => void;

/**
 * Done function for a modal.
 */
// export type ModalDone<T = unknown, R = void> = IfUndefined<T, (result?: T) => R, (result: T) => R>;
export type ModalDone<T, R = void> = [undefined] extends [T] ? (result?: T) => R : (result: T) => R;

/**
 * Modal.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Modal<C = any> extends Promise<ModalResult<C>> {
    /**
     * Modal id.
     */
    readonly id: symbol;
    /**
     * Modal controller.
     */
    readonly controller: ModalController<ModalResult<C>>;
    /**
     * Modal props.
     */
    readonly props: ModalProps<C>;
    /**
     * Modal component.
     */
    readonly component: Component;
}
