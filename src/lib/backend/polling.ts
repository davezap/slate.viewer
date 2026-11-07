// A single, cancelable request at a time. The web backend owns the watched space
// and discards stale results; this scheduler owns timing and request lifetime.
type Timer = ReturnType<typeof globalThis.setTimeout>;

export interface PollClock {
  now(): number;
  random(): number;
  setTimeout(callback: () => void, delay: number): Timer;
  clearTimeout(timer: Timer): void;
}

export function retryAfterMilliseconds(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.min(300_000, Math.max(0, delay)) : 0;
}

export function createPoller(task: (signal: AbortSignal) => Promise<void>, options: {
  intervalMs?: number;
  timeoutMs?: number;
  clock?: Partial<PollClock>;
} = {}) {
  const clock: PollClock = {
    now: () => performance.now(), random: () => Math.random(),
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: timer => globalThis.clearTimeout(timer),
    ...options.clock,
  };
  const interval = Math.max(1, options.intervalMs ?? 5000);
  const timeout = Math.max(1, options.timeoutMs ?? 15_000);
  let enabled = false;
  let generation = 0;
  let runningGeneration = 0;
  let timer: Timer | undefined;
  let controller: AbortController | undefined;
  let flight: Promise<void> | undefined;
  let failures = 0;
  let notBefore = 0;

  function clearTimer() {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = undefined;
  }

  function schedule(delay: number) {
    clearTimer();
    if (!enabled) return;
    timer = clock.setTimeout(() => { timer = undefined; void run(); }, Math.max(delay, notBefore - clock.now(), 0));
  }

  function run(): Promise<void> {
    if (flight) return flight;
    if (!enabled) return Promise.resolve();
    if (clock.now() < notBefore) { schedule(0); return Promise.resolve(); }
    clearTimer();
    const current = generation;
    const abort = new AbortController();
    controller = abort;
    runningGeneration = current;
    let timedOut = false;
    const deadline = clock.setTimeout(() => { timedOut = true; abort.abort(); }, timeout);
    let next = interval;
    flight = Promise.resolve().then(() => task(abort.signal)).then(() => {
      if (current !== generation) return;
      if (abort.signal.aborted) {
        if (timedOut) throw new Error('Polling request timed out');
        return;
      }
      failures = 0;
      notBefore = 0;
      next = interval * (1 + clock.random() / 4);
    }).catch((error: unknown) => {
      if (current !== generation || abort.signal.aborted && !timedOut) return;
      failures = Math.min(failures + 1, 6);
      const ceiling = Math.max(interval, Math.min(60_000, interval * 2 ** failures));
      const floor = Math.max(interval, ceiling / 2);
      const jittered = floor + clock.random() * (ceiling - floor);
      const supplied = (error as { retryAfterMs?: number } | null)?.retryAfterMs ?? 0;
      const hint = Number.isFinite(supplied) ? Math.max(0, Math.min(300_000, supplied)) : 0;
      next = Math.max(jittered, hint);
      if (hint > jittered) next += clock.random() * Math.min(interval, hint / 4);
      notBefore = clock.now() + next;
    }).finally(() => {
      clock.clearTimeout(deadline);
      controller = undefined;
      flight = undefined;
      if (enabled) schedule(current === generation ? next : clock.random() * 1000);
    });
    return flight;
  }

  function pause() {
    enabled = false;
    generation++;
    clearTimer();
    controller?.abort();
  }

  function resume() {
    if (enabled) return;
    enabled = true;
    if (!flight) schedule(clock.random() * 1000);
  }

  function restart(active = true) {
    pause();
    failures = 0;
    notBefore = 0;
    if (active) resume();
  }

  async function refresh(): Promise<void> {
    if (!enabled) return;
    if (flight) {
      const observed = runningGeneration;
      await flight;
      if (enabled && observed !== generation) await refresh();
      return;
    }
    await run();
  }

  return { pause, resume, restart, refresh };
}
