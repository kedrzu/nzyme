import { CancelError } from '@nzyme/utils/CancelError.js';
import type { App } from 'vue';

/** Vue plugin that suppresses CancelError in both promise rejections and Vue error handler. */
export function CommonPlugin(app: App) {
    if (typeof window !== 'undefined') {
        // unhandled promises are caught by this handler
        // we should preserve the previous one, to preserve default error handling
        const onunhandledrejection = window.onunhandledrejection?.bind(window);
        window.onunhandledrejection = (event: PromiseRejectionEvent) => {
            if (event.reason instanceof CancelError) {
                return false;
            }

            if (onunhandledrejection) {
                return onunhandledrejection(event) as unknown;
            }

            console.error(event.reason);
            return undefined;
        };
    }

    // we should preserve the previous one, to preserve default error handling

    const errorHandler = app.config.errorHandler;
    app.config.errorHandler = (err, vm, info) => {
        if (err instanceof CancelError) {
            return false;
        }

        if (errorHandler) {
            return errorHandler(err, vm, info);
        }

        console.error(err);
    };
}
