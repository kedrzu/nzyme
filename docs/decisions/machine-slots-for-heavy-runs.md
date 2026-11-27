# A fixed number of heavy runs per machine

## Status

Accepted

## Context

Agents run heavy test suites in parallel, across worktrees and across repositories, on one developer
machine. Running too many at once exhausts memory and processes start dying.

The mechanism this replaces, in a consuming repository, was a file-based semaphore with a fixed slot
count per clone. It could not see runs from other repositories, and every heavy command had to be
wrapped by a process that agents had to remember to use.

A first version of this package admitted runs by measured free memory: each caller declared a cost as
`base + perWorker × workers` and got as many workers as fitted. It was dropped:

- The cost lives in each caller, measured once on one machine, and means nothing in another project.
  "A worker" is not a concept every heavy run has.
- A request larger than a machine's memory failed at once, so a smaller laptop could not run the suite
  at all.
- Resident memory overstates the real cost. **Checked 2026-11-04:** a story-test run peaked at 9.6 GiB
  of RSS while available memory fell by 4.3 GiB.

Admitting by free memory at the start, with a gap between starts, was also measured and dropped.
**Checked 2026-11-24**, on macOS with 64 GiB, three suites (e2e on 6 workers, integration on 6, story
tests) started 20 s apart: under that load e2e reached its memory peak after 52 s (26 s alone) and took
146 s (41 s alone), so a run starting 20 s after another sees memory that is about to be taken. The
three together reached the macOS memory pressure warning level for 88 s, never critical, with no swap
growth.

## Options Considered

- **Admission by measured memory.** See Context.
- **A start gap with a free-memory check.** See Context: memory grows later than any gap short enough
  to be worth having.
- **A fixed number of heavy runs per machine, shared by every repository.** Knows nothing about what a
  run costs; each project fixes its own parallelism.

## Decision

A machine-global FIFO queue of **slots**, `@nzyme/machine`, with `nzyme machine reserve|status` for
shell scripts.

- A heavy run takes one slot, whatever it does with it. How many workers it starts is its own fixed
  choice, which its project sizes to fit a modest machine.
- The machine has one slot per 20 GiB of physical memory, at least one, so a 64 GiB machine runs three
  heavy runs at once and a 16 GiB one runs one. `NZYME_MACHINE_SLOTS` overrides it; every repository on
  the machine has to see the same value, so it belongs in the user's shell profile, never in a caller.
  The 20 GiB is a starting point, not a measurement.
- State lives in the user's home directory, so every repository shares one queue. A directory lock is
  held only for one admission decision, and one older than 30 s is removed: a holder stalled that long
  (a suspended laptop) can cost one grant over the limit.
- A request whose place in the queue has not improved for 30 minutes fails with the holders and the
  queue. Waiting has no other limit, and FIFO is strict.
- A slot is owned by a pid and its start time, compared in UTC, and frees itself when that process is
  gone. No daemon and no wrapper: a JavaScript caller owns its own slot; a shell script reserves for its
  own pid and runs the heavy command under it.

## Consequences

- A light run and a heavy one take a slot alike, so a light run can wait for nothing. Callers reserve
  only for runs that are heavy.
- Memory used outside the queue (dev servers, builds, the browser) is not seen. The slot count leaves
  room for it only as far as the 20 GiB per slot does.
- A state format change creates a new versioned directory. An older client waits on live reservations
  in a directory it cannot parse and tells the user to update, instead of ignoring them.
- macOS and Linux only (`ps -o lstart`).
