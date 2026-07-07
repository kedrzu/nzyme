/**
 * A stack frame with function information.
 */
export interface StackFrameFunction {
    /** The type of stack frame. */
    type: 'function';
    /** The name of the function. */
    name: string;
    /** The file path with line and column number (e.g., "file.ts:10:5"). */
    filePath: string;
}

/**
 * A raw stack frame that couldn't be parsed.
 */
export interface StackFrameRaw {
    /** The type of stack frame. */
    type: 'raw';
    /** The raw text of the stack frame line. */
    text: string;
}

/**
 * A simple stack frame without file information.
 */
export interface StackFrameSimple {
    /** The type of stack frame. */
    type: 'simple';
    /** The text content of the stack frame. */
    text: string;
}

/**
 * A parsed stack frame.
 */
export type StackFrame = StackFrameFunction | StackFrameRaw | StackFrameSimple;

/**
 * Parses a stack trace string into structured frames.
 * @util
 *
 * @param stack - The stack trace string to parse
 * @returns An array of parsed stack frames
 *
 * @__NO_SIDE_EFFECTS__
 */
export function parseStackTrace(stack: string): StackFrame[] {
    return stack
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
            const match = line.match(/^\s*at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
            if (match) {
                const filePath = match[2]!;
                return {
                    type: 'function' as const,
                    name: match[1]!,
                    filePath: `${filePath}:${match[3]}:${match[4]}`,
                };
            }

            const simpleMatch = line.match(/^\s*at\s+(.+)/);
            if (simpleMatch) {
                return {
                    type: 'simple' as const,
                    text: simpleMatch[1]!,
                };
            }

            return {
                type: 'raw' as const,
                text: line,
            };
        });
}
