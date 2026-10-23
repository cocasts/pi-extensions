/**
 * Session accounting for the status line: token volumes, cache reuse, and spend.
 *
 * The rules follow the reference footer, which followed pi's own usage records: every assistant
 * message and every tool result carries `usage`, and compaction and branch-summary entries bill a
 * model call of their own. The cache hit rate is the most recent assistant turn's share of prompt
 * tokens served from cache — the latest reading, not a session average that folds in cold starts.
 *
 * Entries arrive as `unknown` and are narrowed structurally, so a truncated or hand-edited session
 * file degrades to a missing number instead of a thrown footer.
 */

export interface SessionTotals {
  input: number;
  output: number;
  /** Share of the last assistant prompt served from cache, 0–100; null before any prompt. */
  cacheHitRate: number | null;
  /** Session spend in USD. */
  cost: number;
}

interface UsageLike {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: { total: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** A structurally valid usage record, or null when the entry has none. */
function usageOf(value: unknown): UsageLike | null {
  if (!isRecord(value)) return null;
  const cost = isRecord(value.cost) ? value.cost : {};
  return {
    input: num(value.input),
    output: num(value.output),
    cacheRead: num(value.cacheRead),
    cacheWrite: num(value.cacheWrite),
    cost: { total: num(cost.total) },
  };
}

export function collectTotals(entries: readonly unknown[]): SessionTotals {
  const totals: SessionTotals = { input: 0, output: 0, cacheHitRate: null, cost: 0 };

  const add = (usage: UsageLike | null, assistant: boolean): void => {
    if (usage === null) return;
    totals.input += usage.input;
    totals.output += usage.output;
    totals.cost += usage.cost.total;
    if (!assistant) return;
    const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
    if (prompt > 0) totals.cacheHitRate = (usage.cacheRead / prompt) * 100;
  };

  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (entry.type === 'message' && isRecord(entry.message)) {
      const role = entry.message.role;
      if (role === 'assistant') add(usageOf(entry.message.usage), true);
      else if (role === 'toolResult') add(usageOf(entry.message.usage), false);
      continue;
    }
    // Compaction and branch summaries bill a model call of their own.
    if (entry.type === 'compaction' || entry.type === 'branch_summary') add(usageOf(entry.usage), false);
  }

  return totals;
}
