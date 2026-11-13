import type { ConfigSource } from './ConfigSource.js';
import { readConfigFile } from './readConfigFile.js';
import type { ReadConfigFileOptions } from './readConfigFile.js';

/** Source of a JSON document on disk. An absent optional file contributes nothing. */
export function fileSource(options: ReadConfigFileOptions): ConfigSource {
    return {
        name: `file ${options.path}`,
        load: () => readConfigFile(options) ?? {},
    };
}
