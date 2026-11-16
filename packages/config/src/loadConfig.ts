import type { Container } from '@nzyme/ioc/Container.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { LoggerTransport } from '@nzyme/logging/LoggerTransport.js';
import type { JsonValue } from '@nzyme/types/JsonValue.js';

import type { ConfigSource } from './ConfigSource.js';
import { RuntimeConfig } from './RuntimeConfig.js';

/**
 * Loads every source, merges them and installs the result as the container's {@link RuntimeConfig}.
 *
 * Precedence is the order of `sources`: the first source owning a key wins, and a key also present
 * in a later source is reported as `overridden`. The `Config loaded` log carries source names, the key
 * count and overridden key names, never values.
 *
 * A plain function rather than a command, because a scopeless command resolves its dependencies
 * on the root container, while this must work on any container.
 */
export async function loadConfig(container: Container, sources: readonly ConfigSource[]): Promise<void> {
    const document: Record<string, JsonValue> = {};
    const seen = new Set<string>();
    const overridden = new Set<string>();

    for (const source of sources) {
        const entries = await source.load();

        for (const [key, value] of Object.entries(entries)) {
            if (seen.has(key)) {
                overridden.add(key);
            } else {
                document[key] = value;
                seen.add(key);
            }
        }
    }

    container.set(RuntimeConfig, document);

    const logger = Logger.create({ name: 'loadConfig', transport: container.resolve(LoggerTransport) });
    logger.debug('Config loaded', {
        sources: sources.map(source => source.name),
        keys: seen.size,
        overridden: [...overridden],
    });
}
