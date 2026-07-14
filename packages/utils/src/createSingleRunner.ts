/**
 * State object for single runner
 */
export interface SingleRunnerState<TReturn> {
    /**
     * Current promise if running
     */
    promise?: Promise<TReturn>;
    /**
     * Whether the handler is currently running
     */
    running: boolean;
    /**
     * Last error that occurred
     */
    error?: unknown;
    /**
     * Execute the handler
     */
    execute: () => Promise<TReturn>;
    /**
     * Abandon the current in-flight execution from the runner's point of view
     * so the next `execute()` call starts a fresh handler invocation instead of
     * deduplicating into the stale promise. The underlying handler keeps running
     * to completion — callers that need to halt ongoing work must implement
     * their own cancellation (e.g. a generation counter checked inside the handler).
     */
    reset: () => void;
}

/**
 * Options for creating a single runner
 */
export interface CreateSingleRunnerOptions<TReturn> {
    /**
     * Handler function to execute
     */
    handler: () => Promise<TReturn>;
    /**
     * Optional initial state factory (for reactivity)
     */
    state?: (state: SingleRunnerState<TReturn>) => SingleRunnerState<TReturn>;
}

/**
 * Creates a single runner that ensures only one execution at a time
 * @util
 * @param options Configuration options
 * @returns State object with execute method
 */
export function createSingleRunner<TReturn>(options: CreateSingleRunnerOptions<TReturn>): SingleRunnerState<TReturn> {
    const { handler, state: initialState } = options;

    // Use provided state or create new one
    let state: SingleRunnerState<TReturn> = {
        promise: undefined,
        running: false,
        error: undefined,
        execute,
        reset,
    };

    if (initialState) {
        state = initialState(state);
    }

    // Initialize state properties if not set
    return state;

    // Add execute method
    function execute() {
        // If already running, return the existing promise
        if (state.promise) {
            return state.promise;
        }

        // Create new promise for execution
        const promise = runHandler();
        state.promise = promise;
        return promise;

        async function runHandler() {
            state.running = true;
            state.error = undefined;

            try {
                return await handler();
            } catch (err) {
                state.error = err;
                throw err;
            } finally {
                // The finally clears state only if this execution is still the
                // tracked one — reset() swaps the promise, so a stale execution
                // resolving after reset() must not clobber the new state.
                if (state.promise === promise) {
                    state.running = false;
                    state.promise = undefined;
                }
            }
        }
    }

    function reset() {
        state.promise = undefined;
        state.running = false;
        state.error = undefined;
    }
}
