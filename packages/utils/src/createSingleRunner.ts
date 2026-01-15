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
        const promise = (async () => {
            state.running = true;
            state.error = undefined;

            try {
                return await handler();
            } catch (err) {
                state.error = err;
                throw err;
            } finally {
                state.running = false;
                state.promise = undefined;
            }
        })();

        state.promise = promise;
        return promise;
    }
}
