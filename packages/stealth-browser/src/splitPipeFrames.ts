/** The frames read so far and the bytes of an incomplete last frame. */
export interface PipeFrames {
    /** Each complete message, decoded as UTF-8. */
    frames: string[];
    /** The bytes after the last NUL, to prepend to the next chunk. */
    rest: Buffer;
}

const NUL = 0;

/**
 * Splits what the browser wrote to `--remote-debugging-pipe` into its NUL-terminated messages. Splitting on bytes is
 * safe: UTF-8 never encodes a character with a zero byte, so a frame never ends inside a character.
 * @__NO_SIDE_EFFECTS__
 */
export function splitPipeFrames(buffer: Buffer): PipeFrames {
    const frames: string[] = [];
    let start = 0;
    for (let end = buffer.indexOf(NUL, start); end >= 0; end = buffer.indexOf(NUL, start)) {
        frames.push(buffer.toString('utf8', start, end));
        start = end + 1;
    }
    return { frames, rest: buffer.subarray(start) };
}
