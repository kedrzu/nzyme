import { spawn } from 'node:child_process';

/**
 * Tries to open the URL in the default browser, detached and without waiting. Never throws: where no
 * browser can open (a server, a container), the caller prints the URL anyway.
 * @util
 */
export function openInBrowser(url: string) {
    const [command, args]: [string, string[]] =
        process.platform === 'darwin'
            ? ['open', [url]]
            : process.platform === 'win32'
              ? // Not `cmd /c start`: cmd splits the URL at each `&` and expands `%` and `^`.
                ['rundll32', ['url.dll,FileProtocolHandler', url]]
              : ['xdg-open', [url]];
    try {
        spawn(command, args, { stdio: 'ignore', detached: true })
            .on('error', () => {})
            .unref();
    } catch {
        // No browser here: the caller prints the URL anyway.
    }
}
