# Admit heavy runs by measured machine capacity

## Status

Accepted

## Context

Agents run heavy test suites in parallel, across worktrees and across repositories, on one developer
machine. Running too many at once exhausts memory and processes start dying; running too few leaves the
machine idle while work queues.

The mechanism this replaces, in a consuming repository, was a file-based semaphore with a fixed slot
count per clone. It could not see runs from other repositories, its slot count had no relation to what
the machine could take, and every heavy command had to be wrapped by a process that itself used memory
and that agents had to remember to use.

**Checked 2026-11-02, on macOS with 64 GB:** `os.freemem()` reported about 1.9 GB while `vm_stat` showed
18.7 GB of reclaimable inactive pages, so it cannot measure what new work can use.

**Checked 2026-11-02:** `ps` prints `lstart` in the reader's timezone.

## Options Considered

- **A larger or configurable slot count.** Keeps every run's cost invisible and stays arbitrary: the
  right number depends on what else the machine is doing right now.
- **Reading free memory at start, with no reservations.** Two runs checking in the same second both see
  the same free memory, and a run's memory only appears once it has warmed up, so they overcommit.
- **A wrapper command that holds the slot for its child.** Simple to adopt, but adds a process per run and
  relies on every caller knowing to use it.
- **A library that reserves measured capacity, owned by the heavy process itself.** The place that decides
  parallelism asks how many workers fit and sizes itself.

## Decision

We chose the library, `@nzyme/machine`, with a thin `nzyme machine` CLI for shell scripts.

- A run declares its cost as `base + perWorker × workers`, with minimum and maximum workers. It is granted
  the largest worker count that fits in `available − Σ unmet reservations − reserve`, where a reservation's
  unmet part is what it reserved minus the current RSS of its owner's process tree. The unmet part is what
  stops a run that is still warming up from counting as free memory.
- Memory decides how many workers fit. CPU only gates admission (1-minute load below 85% of cores). Load
  average lags, so runs starting together all pass that gate. A 20 s gap between admissions showed no clear
  benefit over five rounds of two heavy runs started together, too few to detect a small one.
- State lives in the user's home directory, so every repository on the machine shares one FIFO queue. A
  directory lock is held only for one admission decision, and one older than 30 s is removed: a holder
  stalled that long (a suspended laptop) can cost one grant over the limit, which the reserve absorbs. A lock
  that names its owner would avoid that at the price of far more concurrency logic.
- A request whose place in the queue has not improved for 30 minutes (longer than any measured run) fails with
  the numbers. Waiting has no other limit, so a long queue that keeps moving is fine, and FIFO stays strict:
  letting smaller requests pass would starve the large ones.
- A reservation is owned by a pid and its start time, compared in UTC, and stops counting when that process
  is gone. No daemon and no wrapper: a JavaScript caller owns its own reservation; a shell script reserves
  for its own pid and runs the heavy command under it.

## Consequences

- Costs are declared by each caller from measured peaks, and go stale as suites grow. Exceeding a reservation
  costs other runs nothing, because the system memory reading already reflects the real usage. Nothing warns
  about it: `nzyme machine status` shows each holder's reserved against current memory.
- A shell script's owner is the script's process when it runs several commands in sequence. That costs a few
  megabytes of shell, not a runtime.
- Memory of long-lived shared services (a Docker VM, for example) is not attributed to any run. It is simply
  absent from the available memory reading.
- A state format change creates a new versioned directory. An older client waits on live reservations in a
  directory it cannot parse and tells the user to update, instead of ignoring them.
- macOS and Linux only; other platforms fail with a clear error.
