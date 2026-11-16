import { defineEnvVariable } from '@nzyme/ioc/defineEnvVariable.js';

import { parseLoggerLevel } from './parseLoggerLevel.js';

/**
 * The minimum level to log: `LOG_LEVEL=<trace|debug|info|warn|error>` logs that level and above.
 * Unset (or empty) leaves each transport on its own default.
 */
export const LOG_LEVEL = defineEnvVariable('LOG_LEVEL', { required: false, parse: parseLoggerLevel });
