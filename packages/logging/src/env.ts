import { defineEnvVariable } from '@nzyme/ioc/defineEnvVariable.js';

/** The repo's verbose switch: `LOGGING=true` makes the CLI transport print `debug` and `trace` lines too. */
export const LOGGING = defineEnvVariable('LOGGING', { parse: value => value === 'true', default: () => false });
