/** The identity of one attempt of a test: Playwright's `TestInfo`, or a `TestCase` id with a result's retry. */
export interface TestAttempt {
    /** Playwright's test id, the same in the worker (`TestInfo.testId`) and the reporter (`TestCase.id`). */
    testId: string;
    retry: number;
}

/**
 * The trace label of one attempt of a test, the same on the worker side (the fixture labelling the
 * test's requests) and the reporter side (attributing them): `getTestTraceLabel(test.info())` gives
 * a Node-side client the label to send in the `x-nzyme-trace` header.
 * @__NO_SIDE_EFFECTS__
 */
export function getTestTraceLabel(attempt: TestAttempt): string {
    return `${attempt.testId}.${attempt.retry}`;
}
