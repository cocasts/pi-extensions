/**
 * Pure formatting helpers for the status line: token counts, rates, latencies, cost, paths, and
 * context-pressure colours.
 *
 * Nothing here reads the filesystem, the environment, or the clock — every export is a function of
 * its arguments alone, so the test suite can pin each rule without a pi runtime. The one piece of
 * host state these helpers need (the home directory) is passed in by the caller.
 */

import { isAbsolute, relative, resolve, sep } from 'node:path';

import type { ThemeColor } from '@earendil-works/pi-coding-agent';

/** Token counts: 999, 1.2k, 12k, 1.2M, 12M. */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

/** Whole tokens from ten up, one decimal below (matches the harness formatter). */
export function formatTps(tps: number): string {
  const clamped = Math.max(0, tps);
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10);
}

/** Milliseconds below a second, seconds with one decimal under ten, whole seconds from there. */
export function formatLatency(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 1000) return `${Math.round(clamped)}ms`;
  const seconds = clamped / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
}

/**
 * A USD amount, trailing zeros trimmed (`$0.42`, `$2.7`, `$17.8`).
 *
 * A nonzero amount that rounds down to zero renders at the smallest readable amount, `$0.01` — the
 * billing figure never says `$0` for money that was spent.
 */
export function formatCost(cost: number): string {
  if (cost > 0 && Number(cost.toFixed(2)) === 0) return '$0.01';
  return `$${cost.toFixed(2).replace(/\.?0+$/, '')}`;
}

/**
 * An exact integer with the grouping the terminal font can carry cheaply: plain digits, so the
 * column never shifts when a comma appears at the fourth digit.
 */
export function formatExact(count: number): string {
  return String(Math.round(count));
}

/** Context pressure: warning starts above 70%, error above 90%, the native dim below that. */
export function percentColor(percent: number | null): ThemeColor {
  if (percent === null) return 'dim';
  if (percent > 90) return 'error';
  if (percent > 70) return 'warning';
  return 'dim';
}

/**
 * Home-relative path, or the absolute path when it is outside the home directory.
 *
 * `home` is a parameter rather than `os.homedir()` so the rule is testable and so a caller that
 * already resolved the home directory does not resolve it again per frame.
 */
export function formatCwd(cwd: string, home: string): string {
  if (!home) return cwd;
  try {
    const rel = relative(resolve(home), resolve(cwd));
    const inside = rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
    if (!inside) return cwd;
    return rel === '' ? '~' : `~${sep}${rel}`;
  } catch {
    return cwd;
  }
}

/**
 * Shorten a path from the left, keeping the tail that identifies the project. Never returns a
 * mid-word fragment: it degrades to `…/last` and then to `last…`.
 */
export function shortenPath(path: string, maxWidth: number): string {
  if (path.length <= maxWidth) return path;
  const parts = path.split(sep).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = `…${sep}${parts.slice(i).join(sep)}`;
    if (candidate.length <= maxWidth) return candidate;
  }
  const tail = parts.at(-1) ?? path;
  return tail.length <= maxWidth ? tail : `${tail.slice(0, Math.max(1, maxWidth - 1))}…`;
}

/** The last segment of a slash-separated model id (`anthropic/claude-sonnet-4` → `claude-sonnet-4`). */
export function modelShortId(model: string): string {
  return model.split('/').filter(Boolean).at(-1) ?? model;
}

/** Last two segments of a path, for the `parent` path format (`~/dev/project` → `dev/project`). */
export function pathTail(path: string, segments = 2): string {
  const parts = path.split(sep).filter(Boolean);
  return parts.slice(-segments).join(sep);
}
