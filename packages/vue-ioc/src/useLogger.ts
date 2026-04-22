import type { Logger } from '@nzyme/logging/Logger.js';
import { Logger as LoggerService } from '@nzyme/logging/Logger.js';
import { LoggerTransport } from '@nzyme/logging/LoggerTransport.js';

import { useService } from './useService.js';

/**
 * Resolve a named {@link Logger} from the active IoC container. Thin wrapper
 * around `useService(LoggerTransport)` + `Logger.create({ name, transport })`
 * — call sites pass an explicit `name` (typically derived from the view or
 * composable) instead of relying on caller-name inference from `useService(Logger)`.
 */
export function useLogger(name: string): Logger {
    const transport = useService(LoggerTransport);
    return LoggerService.create({ name, transport });
}
