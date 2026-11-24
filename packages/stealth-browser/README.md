# @nzyme/stealth-browser

A stealth Chrome for AI agents, driven over the Chrome DevTools Protocol (CDP). It is the same ordinary browser
every day: a real Chrome with a persistent profile, launched over a pipe so no other local process can reach it, and
a proxy in front of it that keeps the client's code out of what page scripts can observe. Nothing is spoofed but the
Chromium brand: every page and worker names itself Google Chrome, as the installed Chrome would. Why the API looks as
it does: `docs/decisions/stealth-browser-package-api.md`.

Runs on Bun.

## CLI

```bash
bunx @nzyme/stealth-browser [--chrome <path> | --chrome-for-testing [--chrome-version <v>]] \
    [--user-data-dir <dir>] [--port <n>] [--no-pace] [-- <chrome args>]
```

It prints one line to stdout, the endpoint `ws://127.0.0.1:<port>/<token>`; logs go to stderr. Whoever has the
endpoint drives the browser: it listens on `127.0.0.1` only and refuses any connection from a web page (one with an
`Origin` header).

- **Chrome:** the installed Google Chrome by default. `--chrome <path>` names another binary. `--chrome-for-testing`
  downloads the pinned Chrome for Testing once, checks its SHA-256 and reuses it; `--chrome-version` picks another
  version, downloaded over HTTPS but unverified.
- **Profile and cache:** a persistent profile and the Chrome for Testing cache live in `nzyme-stealth-browser/` in the
  user's app data: `~/Library/Application Support` on macOS, `%LOCALAPPDATA%` on Windows,
  `${XDG_DATA_HOME:-~/.local/share}` on Linux. `--user-data-dir` sets another profile.
- **Pace:** each site gets at most one page load every 5 s, and is paused, then slowed, after it blocks or challenges
  the browser. `--no-pace` turns that off.
- **Exit:** non-zero when Chrome exits or the start fails; SIGINT and SIGTERM close the browser cleanly.

> [!WARNING]
> There is no headless mode on purpose. Headless Chrome reports `HeadlessChrome` in its user agent, and the brand
> passes the user agent through as it is, so `-- --headless=new` gives the browser away to every site.

### With agent-browser

```bash
agent-browser --cdp "$(bunx @nzyme/stealth-browser)" open https://example.com
```

Better: start the CLI once in the background, read its first line and pass the endpoint to `agent-browser --cdp` on
every call. Any other client that takes a CDP WebSocket URL works the same way.

## Library

```ts
import { createSitePace, launchStealthBrowser, serveStealthBrowser } from '@nzyme/stealth-browser';
```

- `launchStealthBrowser({ executablePath, userDataDir, args?, policy?, pace?, logger? })` launches Chrome over
  `--remote-debugging-pipe` and resolves once every new target is branded. `browser.connect(socket, { group, data })`
  adds a client on any socket-like object (`send`, `close`); the caller feeds it the socket's messages. A client with a
  `group` sees only that group's pages, and pages it creates join the group. `browser.send` and `browser.attach` are
  the host's own channel, which clients never see.
- `policy(request, client)` judges every client command: pass it on (rewritten or not), answer it, or refuse it. It
  runs after the proxy's session and target checks and before its stealth rules, which no policy can lift.
- `createSitePace()` creates the human pace. Hand the same pace to each launch: what it learned of blocks outlives a
  browser restart.
- `serveStealthBrowser(options & { port? })` is what the CLI runs: it launches the browser and serves it at a
  tokenised `127.0.0.1` endpoint, each socket a client with no group. `close()` stops both.
- `installChromeForTesting({ cacheDir, version?, sha256?, baseUrl? })` installs Chrome for Testing into
  `<cacheDir>/<version>-<platform>/`, a folder that exists only once a verified archive is fully unpacked; concurrent
  calls share one download. `findChromeForTesting({ cacheDir, version? })` finds it without downloading.
  `findChrome()` finds the installed Google Chrome in its standard place.

## The price of isolation

Page scripts must never observe the client, so the proxy never enables Runtime, Console or Debugger in the page:

- every evaluation runs in an isolated world, which shares the page's DOM but not its globals, so a client reads the
  page's variables only through the DOM;
- the client gets no page console messages and no execution context events;
- Playwright and Puppeteer do not work: both need an enabled Runtime. They are out on purpose, not a missing feature.
