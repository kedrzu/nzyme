/** Severity levels in ascending order: a threshold enables its own level and every later one. */
export const LOGGER_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;

/** Severity levels for log messages, from most to least verbose. */
export type LoggerLevel = (typeof LOGGER_LEVELS)[number];
