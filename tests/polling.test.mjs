import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoller, retryAfterMilliseconds } from '../src/lib/backend/polling.ts';

const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function fakeClock() {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    now: () => now, random: () => 0,
    setTimeout: (callback, delay) => { const key = ++id; timers.set(key, { at: now + delay, callback }); return key; },
    clearTimeout: key => timers.delete(key),
    pending: () => timers.size,
    async tick(delay) {
      const until = now + delay;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      now = until;
      await flush();
    },
  };
}

test('slow polls and manual refresh share one request; next poll follows completion', async () => {
  const clock = fakeClock(), gate = deferred();
  let calls = 0;
  const poller = createPoller(async () => { if (++calls === 1) await gate.promise; }, { clock });
  poller.restart();
  const first = poller.refresh(), second = poller.refresh();
  await flush();
  assert.equal(calls, 1);
  await clock.tick(10_000);
  assert.equal(calls, 1);
  gate.resolve();
  await Promise.all([first, second]);
  await clock.tick(4999);
  assert.equal(calls, 1);
  await clock.tick(1);
  assert.equal(calls, 2);
  poller.pause();
  await flush();
  assert.equal(clock.pending(), 0);
});

test('retry advice survives hide/show or offline/online and failures reset on success', async () => {
  const clock = fakeClock();
  let calls = 0;
  const poller = createPoller(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('busy'), { retryAfterMs: 60_000 });
    if (calls === 2) throw new Error('offline');
  }, { clock });
  poller.restart();
  await poller.refresh();
  poller.pause();
  poller.resume();
  await poller.refresh();
  await clock.tick(59_999);
  assert.equal(calls, 1);
  await clock.tick(1);
  assert.equal(calls, 2);
  await clock.tick(9999);
  assert.equal(calls, 2);
  await clock.tick(1);
  assert.equal(calls, 3);
  await clock.tick(5000);
  assert.equal(calls, 4);
  poller.pause();
  assert.equal(clock.pending(), 0);
});

test('pausing cancels active work and prevents retries until resumed', async () => {
  const clock = fakeClock();
  const signals = [];
  const poller = createPoller(signal => {
    signals.push(signal);
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  }, { clock });
  poller.restart();
  const pending = poller.refresh();
  await flush();
  poller.pause();
  await pending;
  assert.equal(signals[0].aborted, true);
  await clock.tick(120_000);
  assert.equal(signals.length, 1);
  assert.equal(clock.pending(), 0);
  poller.resume();
  await clock.tick(0);
  assert.equal(signals.length, 2);
  poller.pause();
  await flush();
});

test('request deadline aborts and backs off instead of overlapping work', async () => {
  const clock = fakeClock();
  const signals = [];
  const poller = createPoller(signal => {
    signals.push(signal);
    if (signals.length > 1) return Promise.resolve();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }));
  }, { clock });
  poller.restart();
  const pending = poller.refresh();
  await flush();
  await clock.tick(15_000);
  await pending;
  assert.equal(signals[0].aborted, true);
  await clock.tick(4999);
  assert.equal(signals.length, 1);
  await clock.tick(1);
  assert.equal(signals.length, 2);
  poller.pause();
});

test('a changed watch waits for retired work; aborted completion cannot reschedule the old generation', async () => {
  const clock = fakeClock(), old = deferred();
  const signals = [];
  let active = 0, peak = 0;
  const poller = createPoller(async signal => {
    active++;
    peak = Math.max(peak, active);
    signals.push(signal);
    try { if (signals.length === 1) await old.promise; }
    finally { active--; }
  }, { clock });
  poller.restart();
  const retired = poller.refresh();
  await flush();
  poller.restart();
  const replacement = poller.refresh();
  await flush();
  assert.equal(signals[0].aborted, true);
  assert.equal(signals.length, 1);
  old.resolve();
  await Promise.all([retired, replacement]);
  assert.equal(signals.length, 2);
  assert.equal(peak, 1);
  poller.pause();
  assert.equal(clock.pending(), 0);
});

test('jitter spreads healthy polls and resume while retry floors are bounded', async () => {
  const clock = fakeClock();
  clock.random = () => 0.5;
  let calls = 0;
  const poller = createPoller(async () => { calls++; }, { clock });
  poller.resume();
  await clock.tick(499);
  assert.equal(calls, 0);
  await clock.tick(1);
  assert.equal(calls, 1);
  await clock.tick(5624);
  assert.equal(calls, 1);
  await clock.tick(1);
  assert.equal(calls, 2);
  poller.pause();
  const now = Date.UTC(2026, 10, 7);
  assert.equal(retryAfterMilliseconds('30', now), 30_000);
  assert.equal(retryAfterMilliseconds(new Date(now + 60_000).toUTCString(), now), 60_000);
  assert.equal(retryAfterMilliseconds('999999999', now), 300_000);
  assert.equal(retryAfterMilliseconds('invalid', now), 0);
  assert.equal(retryAfterMilliseconds('-1', now), 0);
});
