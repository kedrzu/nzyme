# The API of `@nzyme/stealth-browser`

## Status

Accepted

## Context

`@nzyme/stealth-browser` gives an AI agent a real Chrome that sites cannot tell from a person's: launched over
`--remote-debugging-pipe`, branded as Google Chrome, with every client command passed through stealth rules that keep
the client's code out of what page scripts can observe, and a human pace per site. Its first consumer, poweragents,
hosts the browser inside its own daemon: it already runs a WebSocket server with its own authentication, gives each
conversation only its own pages, and restarts the browser without forgetting which sites blocked it. Other users want
none of that: a command that prints an endpoint for `agent-browser --cdp`.

The package must serve both without letting a host weaken the stealth rules, and every export is semver-bound API.

## Options Considered

- **Minimal:** one `createStealthBrowser` with `listen()` inside and policy hooks `check`, `canSee` and `created`. The
  smallest API. Rejected: a host could not keep its own server and authentication, and which client sees which target
  would sit in the host's `canSee`, re-implemented by every host.
- **Interceptor pipeline:** about 20 exports, with transports and layers (session checks, policy, stealth, pace) as
  seams a host composes. Rejected: a misordered interceptor could run a client command past the stealth rules, and
  every hook is a public contract to keep stable.
- **Hybrid:** `launchStealthBrowser` returns the browser; `connect(socket, { group, data })` adds a client on any
  socket the host accepted; `serveStealthBrowser` is the ready server; `createSitePace` stands alone.

## Decision

The hybrid.

- **Groups, not visibility hooks.** A client with a `group` sees only that group's pages, and pages it creates or
  opens join it; the package owns target visibility, the host only names the group.
- **One policy, always before the stealth rules.** `policy(request, client)` may pass, rewrite, answer or refuse a
  command. It runs after the proxy's session and target checks, the checks run again on what it passed, and the
  stealth rules run last. No policy can lift them, since a host's mistake there would be visible to every site.
- **A standalone pace.** `createSitePace()` is created by the host and handed to each launch, so what it learned of
  blocks outlives a browser restart.
- **The server is small and closed.** `serveStealthBrowser` listens on `127.0.0.1` only, behind a random token in
  the path, and refuses any upgrade with an `Origin` header, so no web page can reach it. The CLI is this server plus
  argument parsing.
- **Chrome for Testing is pinned, with a SHA-256 per platform,** not tracking Stable. The brand is verified per
  version against installed Google Chrome, so a version nobody checked could give the browser away; the checksum
  keeps a tampered archive from ever being unpacked. A caller may name another version, which is downloaded
  unverified. By default the CLI uses the installed Google Chrome, which the user keeps up to date.
- **Playwright and Puppeteer are out on purpose.** Both need an enabled Runtime in the page, which the stealth rules
  never allow.

## Consequences

- poweragents keeps its own server and authentication, connects each conversation as a group, and moves its pace and
  Chrome for Testing cache to the package without a second download.
- A host cannot reorder or replace the stealth rules; a rule a host needs that the policy cannot express is a change
  to the package.
- Every Chrome for Testing bump re-checks the brand's expected lists and pins four new checksums.
- Clients get no page console and no page globals; a client written for Playwright or Puppeteer has to move to raw
  CDP or a CDP-level tool such as agent-browser.
