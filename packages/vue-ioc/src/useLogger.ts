import { getCurrentInstance } from 'vue';
import type { ConcreteComponent } from 'vue';

import type { Logger } from '@nzyme/logging/Logger.js';
import { Logger as LoggerService } from '@nzyme/logging/Logger.js';
import { LoggerTransport } from '@nzyme/logging/LoggerTransport.js';

import { useService } from './useService.js';

/**
 * Resolve a named {@link Logger} from the active IoC container. Without a `name`, the logger is named
 * after the component being set up — so a composable that calls `useLogger()` logs under the component
 * using it — and is unnamed outside a component. Pass a `name` when it should not follow the component.
 */
export function useLogger(name?: string): Logger {
    const transport = useService(LoggerTransport);
    const instance = getCurrentInstance();
    name ??= instance ? getComponentName(instance.type) : undefined;
    return LoggerService.create({ name, transport });
}

/**
 * The component's declared name, else the name the SFC compiler infers from its file name — the name
 * Vue's own warnings use.
 */
function getComponentName(component: ConcreteComponent) {
    if (typeof component === 'function') {
        return component.displayName || component.name;
    }

    return component.name || component.__name;
}
