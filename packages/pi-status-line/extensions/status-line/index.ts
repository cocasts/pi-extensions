/**
 * `@cocasts/pi-status-line` — a modular single-row footer for the pi coding agent.
 *
 * This file is only the wiring: it loads the config, collects the numbers the modules read, keeps
 * the footer repainting while a turn streams, and registers `/statusline`. Everything that decides
 * what the line looks like is a pure function under `render.ts`, `modules.ts`, and `config.ts`, so
 * the interesting rules are covered by tests that never start pi.
 *
 * Layout of the turn-metrics contract is the reference footer's (deepseek-harness): a request opens
 * at `before_provider_request`, its first streamed delta freezes TTFT, and a message's decode rate is
 * `usage.output / ((messageEnd - firstToken) / 1000)` — reporting absence, not a fake, when the
 * decode window is too short to measure.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ReadonlyFooterDataProvider,
} from '@earendil-works/pi-coding-agent';

import { type ParsedConfig, parseConfig, reportConfig } from './config.ts';
import { formatCwd, formatLatency, formatTps } from './format.ts';
import type { StatusLineParts } from './modules.ts';
import { renderStatusLine } from './render.ts';
import { collectTotals } from './session-metrics.ts';
import { frozenThroughput, ttftMs, windowThroughput } from './throughput.ts';

/**
 * Where the module lists live. Read at session start and on `/reload`.
 *
 * Pi's own `PI_CODING_AGENT_DIR` override is honoured, so a throwaway agent directory (tests, a
 * sandboxed run) also gets a throwaway status line instead of writing into the real config.
 */
function configPath(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent');
  return join(agentDir, 'status-line', 'config.json');
}
/** A streaming turn repaints at most this often; the footer is not an animation. */
const LIVE_RENDER_MS = 200;
/** The trailing window the in-flight rate is measured over. */
const WINDOW_MS = 2000;
/** A decode window shorter than this is a burst arrival, not a measurable decode phase. */
const MIN_SAMPLE_MS = 200;
/** Pi's own estimateTokens() heuristic, used only until a stream gives a real tokens-per-char ratio. */
const FALLBACK_TOKENS_PER_CHAR = 0.25;

/** Last context usage pi reported with real numbers, shown when pi's current answer is stale. */
interface KnownUsage {
  tokens: number;
  percent: number;
  contextWindow: number;
}

/** The latest turn reading: the rate, and whether it came from provider usage or an estimate. */
interface Reading {
  rate: number;
  exact: boolean;
}

/** The last completed turn's timing, reported by `/statusline` and rendered by the tps module. */
interface LastTurn {
  /** Time to first token, or null when the anchors did not line up. */
  ttftMs: number | null;
  decodeMs: number;
  rate: number | null;
  exact: boolean;
}

/** One plain-text line for the last turn, for the `/statusline` report. */
function describeLastTurn(turn: LastTurn | null): string {
  if (turn === null) return '  not measured yet';
  const ttft = turn.ttftMs === null ? 'ttft n/a' : `ttft ${formatLatency(turn.ttftMs)}`;
  const rate = turn.rate === null ? 'no measurable rate' : `${turn.exact ? '' : '~'}${formatTps(turn.rate)} tok/s`;
  return `  ${ttft} · decode ${formatLatency(turn.decodeMs)} · ${rate}`;
}

export default function (pi: ExtensionAPI) {
  let parsed: ParsedConfig = parseConfig(null);
  let configFound = false;

  let requestRender: (() => void) | null = null;
  let lastKnownUsage: KnownUsage | null = null;

  let reading: Reading | null = null;
  let lastTurn: LastTurn | null = null;
  let requestAt: number | null = null;
  let firstTokenAt: number | null = null;
  /** Characters streamed for the current message, used for the live rate estimate. */
  let chars = 0;
  /** Tokens per character, learned from finished messages rather than assumed forever. */
  let ratio: number | null = null;
  let windowAt = 0;
  let windowTokens = 0;
  let renderedAt = 0;

  function resetStream(): void {
    chars = 0;
    firstTokenAt = null;
    windowAt = 0;
    windowTokens = 0;
    renderedAt = 0;
  }

  /** Drops the in-flight anchor. A run that ends without a first token must not keep counting. */
  function clearInFlightRequest(): void {
    requestAt = null;
  }

  function publish(rate: number, exact: boolean): void {
    reading = { rate, exact };
    requestRender?.();
  }

  /** Reads the config file and replaces the live layout. Problems are reported once per load. */
  async function loadConfig(notify: (message: string, type?: 'info' | 'warning' | 'error') => void): Promise<void> {
    let text: string | null = null;
    try {
      text = await readFile(configPath(), 'utf8');
      configFound = true;
    } catch {
      // No config file is the normal first run: the defaults are the documented layout.
      configFound = false;
    }
    parsed = parseConfig(text);
    if (parsed.problems.length > 0) {
      notify(`status line: ${parsed.problems.join('; ')}`, 'warning');
    }
  }

  function installFooter(ctx: ExtensionContext): void {
    ctx.ui.setFooter((tui, theme, footerData: ReadonlyFooterDataProvider) => {
      requestRender = () => tui.requestRender();

      return {
        invalidate() {},
        dispose() {
          requestRender = null;
        },
        render(width: number): string[] {
          if (width <= 0) return [''];

          const usage = ctx.getContextUsage();
          // pi nulls tokens and percent when the last usage predates a compaction and no response
          // has landed since: those numbers are stale, not zero. Keep the last trusted reading.
          const trusted =
            usage !== undefined && usage.tokens !== null && usage.percent !== null
              ? { tokens: usage.tokens, percent: usage.percent, contextWindow: usage.contextWindow }
              : null;
          if (trusted !== null) lastKnownUsage = trusted;
          const shown = trusted ?? lastKnownUsage;

          const totals = collectTotals(ctx.sessionManager.getEntries());
          // Native only names the provider when a route can be chosen; with one provider it is noise.
          const provider = footerData.getAvailableProviderCount() > 1 ? (ctx.model?.provider ?? null) : null;
          const parts: StatusLineParts = {
            model: ctx.model?.id ?? 'no model',
            provider,
            effort: ctx.thinkingLevel ?? null,
            path: formatCwd(ctx.cwd, homedir()),
            branch: footerData.getGitBranch() ?? null,
            session: ctx.sessionManager.getSessionName() ?? null,
            input: totals.input,
            output: totals.output,
            cacheHitRate: totals.cacheHitRate,
            // The latest turn, not the session average: an average folds in cold-cache warm-up
            // turns and reports a speed this route no longer has.
            tps: reading === null ? null : `${reading.exact ? '' : '~'}${formatTps(reading.rate)}`,
            contextTokens: shown?.tokens ?? 0,
            contextWindow: usage?.contextWindow ?? shown?.contextWindow ?? ctx.model?.contextWindow ?? 0,
            contextPercent: shown?.percent ?? null,
            cost: totals.cost,
          };

          return renderStatusLine(theme, width, parsed.layout, parts);
        },
      };
    });
  }

  // TTFT's request anchor, from the agent loop: turn_start opens the LLM call and
  // before_provider_request is the last thing pi does before the wire. message_start is not that
  // moment, and anchoring there made a first token that arrived early read as a clamped 0ms.
  pi.on('turn_start', clearInFlightRequest);
  pi.on('before_provider_request', () => {
    requestAt = Date.now();
  });

  // Every way a run can retire retires the in-flight request with it.
  pi.on('turn_end', clearInFlightRequest);
  pi.on('agent_end', clearInFlightRequest);
  pi.on('agent_settled', clearInFlightRequest);

  pi.on('session_start', async (_event, ctx) => {
    reading = null;
    requestAt = null;
    ratio = null;
    lastKnownUsage = null;
    lastTurn = null;
    resetStream();
    await loadConfig((message, type) => ctx.ui.notify(message, type ?? 'info'));
    installFooter(ctx);
  });

  pi.on('message_start', async (event) => {
    if (event.message.role !== 'assistant') return;
    resetStream();
  });

  pi.on('message_update', async (event) => {
    const delta = event.assistantMessageEvent;
    // Narrowing on the discriminant is what keeps the payload typed; membership in a Set of
    // strings tells the compiler nothing.
    if (delta.type !== 'text_delta' && delta.type !== 'thinking_delta' && delta.type !== 'toolcall_delta') {
      return;
    }

    const now = Date.now();
    if (firstTokenAt === null) firstTokenAt = now;
    chars += delta.delta.length;

    const tokens = chars * (ratio ?? FALLBACK_TOKENS_PER_CHAR);
    if (windowAt === 0 || now - windowAt > WINDOW_MS) {
      windowAt = now;
      windowTokens = tokens;
    }

    const decodeMs = now - firstTokenAt;
    if (decodeMs < MIN_SAMPLE_MS || now - renderedAt < LIVE_RENDER_MS) return;

    const rate = windowThroughput(tokens, windowTokens, now - windowAt);
    if (rate === null) return;
    renderedAt = now;
    publish(rate, false);
  });

  pi.on('message_end', async (event) => {
    if (event.message.role !== 'assistant') return;

    const message = event.message as { usage?: { output?: number } };
    const output = typeof message.usage?.output === 'number' ? message.usage.output : 0;
    // Learn the tokens-per-character ratio from the finished message itself: the same streamed
    // characters that fed the live estimate, against the provider's authoritative output count.
    if (output > 0 && chars > 0) {
      const sample = output / chars;
      ratio = ratio === null ? sample : (ratio + sample) / 2;
    }

    const decodeMs = firstTokenAt !== null ? Date.now() - firstTokenAt : 0;
    const tokens = output > 0 ? output : chars * (ratio ?? FALLBACK_TOKENS_PER_CHAR);
    const rate = frozenThroughput(decodeMs, tokens, MIN_SAMPLE_MS);
    const measured = ttftMs(requestAt, firstTokenAt);
    lastTurn = { ttftMs: measured, decodeMs, rate, exact: output > 0 };
    // A sub-floor window is a burst arrival: keep no rate rather than print a confident fake.
    if (rate === null) reading = null;
    else publish(rate, output > 0);

    // Null it with the stream: a request that has produced its message is no longer in flight.
    requestAt = null;
    resetStream();
  });

  pi.registerCommand('statusline', {
    description: 'Show the effective status-line rows, their formatting, and any config problems',
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const source = configFound ? configPath() : `${configPath()} (not found — using the built-in defaults)`;
      const lines = reportConfig(parsed, source);
      lines.push('', 'last turn:', describeLastTurn(lastTurn));
      lines.push('', 'Edit the file, then run /reload to apply it.');
      ctx.ui.notify(lines.join('\n'), parsed.problems.length > 0 ? 'warning' : 'info');
    },
  });
}
