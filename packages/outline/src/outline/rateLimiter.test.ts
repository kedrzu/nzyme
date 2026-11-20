import { expect, test } from 'bun:test';

import { createRateLimiter } from './rateLimiter.js';

test('lets 100 general calls through at once, then makes the 101st wait for a refill', async () => {
    const { limiter, slept } = setup();

    for (let call = 0; call < 100; call++) {
        await limiter.acquire('general');
    }
    expect(slept).toEqual([]);

    await limiter.acquire('general');
    expect(slept).toEqual([600]);
});

test('lets 25 create-type calls through, then makes the 26th wait 2.4 s even though the general bucket is nearly full', async () => {
    const { limiter, slept } = setup();

    for (let call = 0; call < 25; call++) {
        await limiter.acquire('create');
    }
    expect(slept).toEqual([]);

    await limiter.acquire('create');
    expect(slept).toEqual([2400]);
});

test('create-type calls also spend general tokens', async () => {
    const { limiter, slept } = setup();

    for (let call = 0; call < 25; call++) {
        await limiter.acquire('create');
    }
    for (let call = 0; call < 75; call++) {
        await limiter.acquire('general');
    }
    expect(slept).toEqual([]);

    await limiter.acquire('general');
    expect(slept).toEqual([600]);
});

function setup() {
    let time = 0;
    const slept: number[] = [];
    const limiter = createRateLimiter({
        now: () => time,
        sleep: ms => {
            slept.push(ms);
            time += ms;
            return Promise.resolve();
        },
    });
    return { limiter, slept };
}
