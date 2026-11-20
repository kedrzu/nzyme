import type { ConfigDefinition } from '@nzyme/config/defineConfig.js';
import { RuntimeConfig } from '@nzyme/config/RuntimeConfig.js';
import type { Container } from '@nzyme/ioc/Container.js';

/**
 * The secret's value in the container's config document, or `undefined` when the document lacks it. For code
 * that runs without the secret on purpose (a Worker answering `not_configured`, a report skipping a section);
 * everywhere else `container.resolve(SECRET)` fails naming the missing secret and `secrets set`.
 */
export function resolveOptionalSecret(container: Container, secret: ConfigDefinition<string>): string | undefined {
    const value = container.resolve(RuntimeConfig)[secret.name];
    return typeof value === 'string' ? value : undefined;
}
