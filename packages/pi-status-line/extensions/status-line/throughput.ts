/**
 * The decode-rate contract: when a throughput number is honest and when it is absent.
 *
 * Follows the deepseek-harness turn-metrics definitions the reference footer used —
 * `ttftMs = firstTokenTime - requestTime`, `decodeMs = completedTime - firstTokenTime`,
 * `tok/s = output / (decodeMs / 1000)` — because those are the definitions pi's own metrics
 * consumers understand. Everything takes its clocks as arguments, so the rules are testable and
 * the renderer never reads the time itself.
 */

/** The window between dispatching a request and the first streamed delta. */
export function ttftMs(requestAt: number | null, firstTokenAt: number | null): number | null {
  if (requestAt === null || firstTokenAt === null) return null;
  return firstTokenAt > requestAt ? firstTokenAt - requestAt : null;
}

/**
 * The frozen whole-message rate once a message finishes.
 *
 * A decode window below the sample floor is a burst arrival — the message landed in one or two
 * chunks — so there is no decode phase to measure. Reporting absence beats printing a confident
 * `82000 tok/s` for an 82-token greeting.
 */
export function frozenThroughput(decodeMs: number, tokens: number, minSampleMs: number): number | null {
  if (decodeMs < minSampleMs) return null;
  return (tokens / decodeMs) * 1000;
}

/**
 * The in-flight rate over a trailing window: how many tokens the stream added since the last
 * sample, over the elapsed window. A zero-length window has no rate.
 */
export function windowThroughput(tokens: number, previousTokens: number, windowMs: number): number | null {
  if (windowMs <= 0) return null;
  return Math.max(0, ((tokens - previousTokens) / windowMs) * 1000);
}
