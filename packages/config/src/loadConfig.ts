import type { Container } from '@nzyme/ioc/Container.js';
import type { JsonValue } from '@nzyme/types/JsonValue.js';

import type { ConfigSource } from './ConfigSource.js';
import { RuntimeConfig } from './RuntimeConfig.js';

/**
 * Loads every source, merges them and installs the result as the container's {@link RuntimeConfig}.
 *
 * Precedence is the order of `sources`: the first source owning a key wins. It logs nothing: a process
 * loads its config on every start, and a line per start is noise.
 *
 * A plain function rather than a command, because a scopeless command resolves its dependencies
 * on the root container, while this must work on any container.
 */
export async function loadConfig(container: Container, sources: readonly ConfigSource[]): Promise<void> {
    const document: Record<string, JsonValue> = {};

    for (const source of sources) {
        for (const [key, value] of Object.entries(await source.load())) {
            if (!Object.hasOwn(document, key)) {
                document[key] = value;
            }
        }
    }

    container.set(RuntimeConfig, document);
}
