import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl } from '../config/api';
import { subscribeStaleness } from './stalenessStream';

// SA-201 / SA-213: the live-update stream reconnects after the server ends it
// (time limit) or the network drops, and resumes from the last versions it saw.

function sseResponse(events: object[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => vi.restoreAllMocks());

describe('subscribeStaleness', () => {
  it('reconnects after a clean end and sends the last versions as ?since=', async () => {
    const ctrl = new AbortController();
    const urls: string[] = [];
    const responses = [
      sseResponse([
        { type: 'snapshot', versions: { outline: 'v1' } },
        { type: 'invalidates', data: ['outline'], versions: { outline: 'v2' } },
      ]),
      sseResponse([
        { type: 'snapshot', versions: { outline: 'v3' } },
        { type: 'invalidates', data: ['outline'], versions: { outline: 'v3' } },
      ]),
    ];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      urls.push(String(input));
      const next = responses.shift();
      if (!next) { ctrl.abort(); throw new DOMException('aborted', 'AbortError'); }
      return next;
    });
    const seen: string[][] = [];
    // Fake clock: the reconnect pauses (500 ms each) pass instantly instead of
    // costing a real second, which a busy machine stretches toward the timeout.
    vi.useFakeTimers();
    const done = subscribeStaleness('7', (d) => seen.push(d), ctrl.signal);
    await vi.advanceTimersByTimeAsync(2000);
    await done;
    vi.useRealTimers();

    expect(urls[0]).toBe(apiUrl('/consistency/projects/7/staleness/stream/'));
    const since = new URL(urls[1], 'http://x').searchParams.get('since');
    expect(JSON.parse(since!)).toEqual({ outline: 'v2' });
    expect(seen).toEqual([['outline'], ['outline']]);
  });

  it('retries after a failed connect', async () => {
    vi.useFakeTimers();
    const ctrl = new AbortController();
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('network down');
      ctrl.abort();
      return sseResponse([{ type: 'snapshot', versions: {} }]);
    });
    const done = subscribeStaleness('7', () => {}, ctrl.signal);
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(calls).toBe(2);
    vi.useRealTimers();
  });

  it('stops for good on 404 (not your project)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    await subscribeStaleness('7', () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
