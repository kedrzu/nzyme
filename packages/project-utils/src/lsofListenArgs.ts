/**
 * Build the `lsof` arguments that list the PIDs listening on a TCP port.
 *
 * `-t` makes lsof print only PIDs (one per line), which is all both the sync and async probes need.
 * lsof exits 1 with empty output when nothing is listening — callers treat that as "no listeners".
 * This is the single source of the flags so the sync ({@link isPortListening}) and async
 * ({@link killPortListeners}) probes can never drift apart.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function lsofListenArgs(port: number): string[] {
    return ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'];
}
