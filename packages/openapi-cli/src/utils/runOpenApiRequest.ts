import type { CommandContext } from '@nzyme/cli-core/Command.js';
import type { Container } from '@nzyme/ioc/Container.js';

import type { OpenApiCommandsOptions } from '../defineOpenApiCommands.js';

/** How long one request, body included, may take before it is abandoned. */
const TIMEOUT_MS = 30_000;

/** HTTP methods the CLI can send; `get` sends only GET, `write` only the others. */
export type OpenApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** What {@link runOpenApiRequest} sends. */
export interface OpenApiRequestParams {
    method: OpenApiMethod;
    /** Path relative to the base URL, starting with `/`; it may already carry a query string. */
    path: string;
    /** Query parameters as `key=value` pairs, repeatable (`expand[]=owners`). */
    query: string[];
    /** A JSON text, sent as the body as given. */
    body?: string;
    /**
     * The command's scoped container, handed to `credential`. Optional so callers written before it existed
     * keep compiling; without it, a `credential` that reads `container` throws.
     */
    container?: Container;
}

/**
 * Sends one request to the service and reports it to the command's streams: the response body as one
 * compact JSON line on stdout (text when it is not JSON), or a failure on stderr with exit code 1. The
 * first stderr line of an HTTP failure is exactly `<service> <METHOD> <path> failed: <status>`, the body
 * follows as indented detail. The credential is resolved only after the input is valid, and scrubbed
 * from everything written, so it can never reach either stream. Redirects are refused, so the
 * credential is never forwarded to another host.
 * @returns the exit code
 */
export async function runOpenApiRequest(
    context: Pick<CommandContext, 'stdout' | 'stderr'>,
    options: OpenApiCommandsOptions,
    params: OpenApiRequestParams,
): Promise<number> {
    const { method, path } = params;
    const { service } = options;
    if (!path.startsWith('/')) {
        context.stderr.write('The path must start with /, relative to the API base, e.g. /users\n');
        return 2;
    }

    const query = parseQuery(params.query);
    if (!query) {
        context.stderr.write('--query must be key=value\n');
        return 2;
    }

    const credential = await options.credential({
        get container(): Container {
            if (!params.container) {
                throw new Error('runOpenApiRequest was called without a container for the credential');
            }
            return params.container;
        },
    });
    if (credential === '') {
        context.stderr.write(`The ${service} credential is empty\n`);
        return 1;
    }
    // Scrubbed before parsing and again after: a JSON body may carry the credential escaped (`\/`), which
    // only the parsed and re-serialised text shows verbatim.
    const redact = (text: string) => text.replaceAll(credential, '[redacted]');

    let response: Response;
    let text: string;
    try {
        response = await fetch(buildUrl(options.baseUrl, path, query), {
            method,
            redirect: 'error',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: {
                ...options.headers,
                Authorization: `${options.authScheme} ${credential}`,
                Accept: 'application/json',
                ...(params.body != null && { 'Content-Type': 'application/json' }),
            },
            body: params.body,
        });
        text = redact(await response.text());
    } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
            context.stderr.write(`Request to ${service} timed out after ${TIMEOUT_MS / 1000} s\n`);
            return 1;
        }
        const message = error instanceof Error ? error.message : 'unknown error';
        context.stderr.write(redact(`Request to ${service} failed: ${message}\n`));
        return 1;
    }

    if (!response.ok) {
        context.stderr.write(`${service} ${method} ${path} failed: ${response.status}\n`);
        if (text.trim() !== '') {
            context.stderr.write(redact(`${indent(prettyPrint(text))}\n`));
        }
        return 1;
    }

    if (text.trim() !== '') {
        context.stdout.write(redact(`${compact(text)}\n`));
    }
    return 0;
}

function buildUrl(baseUrl: string, path: string, query: URLSearchParams): string {
    const queryString = query.toString();
    const separator = path.includes('?') ? '&' : '?';
    return `${baseUrl}${path}${queryString ? separator + queryString : ''}`;
}

function parseQuery(pairs: string[]): URLSearchParams | undefined {
    const query = new URLSearchParams();
    for (const pair of pairs) {
        const separator = pair.indexOf('=');
        if (separator < 1) {
            return undefined;
        }
        query.append(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return query;
}

function compact(text: string): string {
    const parsed = tryParse(text);
    return parsed.ok ? JSON.stringify(parsed.value) : text.trim();
}

function prettyPrint(text: string): string {
    const parsed = tryParse(text);
    return parsed.ok ? JSON.stringify(parsed.value, null, 2) : text.trim();
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch {
        return { ok: false };
    }
}

function indent(text: string): string {
    return text
        .split('\n')
        .map(line => `    ${line}`)
        .join('\n');
}
