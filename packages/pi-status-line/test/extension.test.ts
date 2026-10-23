import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';

import statusLine from '../extensions/status-line/index.ts';
import { plainTheme } from './fixtures.ts';

/** One assistant turn, priced, so the token and cost modules have something to read. */
const entries = [
  {
    type: 'message',
    message: {
      role: 'assistant',
      usage: { input: 35_213, output: 1240, cacheRead: 500, cacheWrite: 0, cost: { total: 0.42 } },
    },
  },
];

interface BootOptions {
  configText?: string;
  contextUsage?: { tokens: number | null; percent: number | null; contextWindow: number } | undefined;
  entries?: readonly unknown[];
  providerCount?: number;
  sessionName?: string;
}

let cleanup: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const step of [...cleanup].reverse()) await step();
  cleanup = [];
  vi.useRealTimers();
});

/**
 * Boots the real extension module against a throwaway agent directory.
 *
 * `PI_CODING_AGENT_DIR` is pi's own config-directory override, and the extension reads it at load
 * time, so the test exercises the real `readFile` path without touching the user's config.
 */
async function boot(options: BootOptions = {}) {
  const agentDir = await mkdtemp(join(tmpdir(), 'pi-status-line-'));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  cleanup.push(async () => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(agentDir, { recursive: true, force: true });
  });

  if (options.configText !== undefined) {
    await mkdir(join(agentDir, 'status-line'), { recursive: true });
    await writeFile(join(agentDir, 'status-line', 'config.json'), options.configText);
  }

  const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
  const pi = {
    on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => {
      handlers.set(event, handler);
      return () => {};
    },
    registerCommand: (name: string, definition: { handler: (args: string, ctx: unknown) => Promise<void> }) => {
      commands.set(name, definition);
    },
  } as unknown as ExtensionAPI;

  const notifications: Array<{ message: string; type?: string }> = [];
  const footerFactories: Array<
    (
      tui: unknown,
      theme: Theme,
      footerData: ReadonlyFooterDataProvider,
    ) => { render(width: number): string[]; dispose(): void }
  > = [];
  let repaints = 0;

  const ctx = {
    cwd: join(homedir(), 'dev', 'app'),
    model: { id: 'anthropic/claude-sonnet-4', provider: 'anthropic', contextWindow: 200_000 },
    thinkingLevel: 'medium' as const,
    getContextUsage: () =>
      options.contextUsage === undefined
        ? { tokens: 34_000, percent: 17, contextWindow: 200_000 }
        : options.contextUsage,
    sessionManager: {
      getEntries: () => options.entries ?? entries,
      getSessionName: () => options.sessionName,
    },
    ui: {
      setFooter: (factory: (typeof footerFactories)[number]) => footerFactories.push(factory),
      notify: (message: string, type?: 'info' | 'warning' | 'error') => notifications.push({ message, type }),
    },
  } as unknown as ExtensionContext;

  statusLine(pi);
  const sessionStart = handlers.get('session_start');
  if (sessionStart === undefined) throw new Error('extension did not register session_start');
  await sessionStart({ type: 'session_start' }, ctx);

  const footerData = {
    getGitBranch: () => 'main',
    getExtensionStatuses: () => new Map<string, string>(),
    getAvailableProviderCount: () => options.providerCount ?? 1,
    onBranchChange: () => () => {},
  } as unknown as ReadonlyFooterDataProvider;

  const renderLines = (width = 200): string[] => {
    const factory = footerFactories.at(-1);
    if (factory === undefined) throw new Error('footer was not installed');
    const component = factory({ requestRender: () => (repaints += 1) }, plainTheme, footerData);
    return component.render(width);
  };

  const render = (width = 200): string => renderLines(width)[0] ?? '';

  const runCommand = async (args = ''): Promise<void> => {
    const command = commands.get('statusline');
    if (command === undefined) throw new Error('/statusline was not registered');
    await command.handler(args, ctx as unknown as ExtensionCommandContext);
  };

  return {
    agentDir,
    configPath: join(agentDir, 'status-line', 'config.json'),
    notifications,
    render,
    renderLines,
    runCommand,
    repaints: () => repaints,
    handlers,
  };
}

describe('extension wiring', () => {
  it('installs the native two-row default layout when no config file exists', async () => {
    const app = await boot();
    const [pwd, stats] = app.renderLines(120);
    expect(pwd).toBe('~/dev/app (main)');
    expect(stats).toContain('↑ 35k · ↓ 1.2k · ◎ 1.4%');
    expect(stats).toContain('17.0%/200k');
    expect(stats).toContain('anthropic/claude-sonnet-4 • medium');
    expect(app.notifications).toEqual([]);
  });

  it('names the provider only when more than one is available', async () => {
    const app = await boot({ providerCount: 2 });
    expect(app.renderLines(160)[1]).toContain('(anthropic) anthropic/claude-sonnet-4 • medium');
  });

  it('shows the session name on the directory row when the session has one', async () => {
    const app = await boot({ sessionName: 'tidy-footer' });
    expect(app.renderLines(120)[0]).toBe('~/dev/app (main) • tidy-footer');
  });

  it('applies the rows config it reads at session start, including order and formatting', async () => {
    const app = await boot({
      configText: JSON.stringify({
        divider: ' · ',
        rows: [
          { left: [{ id: 'path' }] },
          {
            left: [{ id: 'input', format: 'exact', label: 'word', prefix: '[', suffix: ']' }],
            right: [
              { id: 'model', format: 'short' },
              { id: 'context', format: 'percent' },
            ],
          },
        ],
      }),
    });
    const [pwd, stats] = app.renderLines(200);
    expect(pwd).toBe('~/dev/app');
    expect(stats?.startsWith('[input 35213]')).toBe(true);
    expect(stats?.endsWith('claude-sonnet-4 · 17%')).toBe(true);
  });

  it('still reads the legacy single-row left/right shape', async () => {
    const app = await boot({
      configText: JSON.stringify({ left: [{ id: 'cost' }], right: [{ id: 'model' }] }),
    });
    const lines = app.renderLines(80);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.trim().startsWith('$0.42')).toBe(true);
    expect(lines[0]?.trim().endsWith('anthropic/claude-sonnet-4')).toBe(true);
  });

  it('re-reads the config on every session start, so /reload picks up edits', async () => {
    const app = await boot({ configText: JSON.stringify({ rows: [{ left: [{ id: 'cost' }], right: [] }] }) });
    expect(app.render(60).trim()).toBe('$0.42');

    await writeFile(app.configPath, JSON.stringify({ rows: [{ left: [{ id: 'output' }], right: [] }] }));
    await app.handlers.get('session_start')?.(
      { type: 'session_start' },
      {
        cwd: homedir(),
        model: { id: 'm' },
        getContextUsage: () => undefined,
        sessionManager: { getEntries: () => entries, getSessionName: () => undefined },
        ui: { setFooter: () => {}, notify: () => {} },
      },
    );
    // The re-registered footer is the last one installed.
    expect(app.render(60).trim()).toBe('↓ 1.2k');
  });

  it('reports config problems once per load, as a warning', async () => {
    const app = await boot({ configText: JSON.stringify({ rows: [{ left: [{ id: 'nope' }], right: [] }] }) });
    expect(app.notifications).toHaveLength(1);
    expect(app.notifications[0]?.type).toBe('warning');
    expect(app.notifications[0]?.message).toContain('unknown module "nope"');
    // The line still renders with the modules that survived.
    expect(app.render(60).trim()).toBe('');
  });

  it('keeps rendering when pi reports a stale context usage', async () => {
    const app = await boot({ contextUsage: { tokens: null, percent: null, contextWindow: 200_000 } });
    expect(app.renderLines(60)[1]).toContain('?/200k');
  });

  it('drops token and cost modules when the session has no usage yet', async () => {
    const app = await boot({
      entries: [],
      configText: JSON.stringify({ rows: [{ left: ['input', 'output', 'cost'], right: ['model'] }] }),
    });
    expect(app.render(80).trim()).toBe('anthropic/claude-sonnet-4');
  });
});

describe('/statusline command', () => {
  it('reports the effective rows, resolved fields, and the config path', async () => {
    const app = await boot({
      configText: JSON.stringify({
        rows: [{ left: [{ id: 'context', format: 'percent' }], right: [{ id: 'model' }] }],
      }),
    });
    await app.runCommand();
    const message = app.notifications.at(-1)?.message ?? '';
    expect(message).toContain(`config: ${app.configPath}`);
    expect(message).toContain('row[0]:');
    expect(message).toContain('context    label=none (default)  format=percent');
    expect(message).toContain('model      label=none (default)');
    expect(message).toContain('none — config is valid');
    expect(message).toContain('last turn:');
    expect(message).toContain('not measured yet');
    expect(message).toContain('/reload');
    expect(app.notifications.at(-1)?.type).toBe('info');
  });

  it('says the defaults are in use when no config file exists', async () => {
    const app = await boot();
    await app.runCommand();
    const message = app.notifications.at(-1)?.message ?? '';
    expect(message).toContain('not found — using the built-in defaults');
    expect(app.notifications.at(-1)?.type).toBe('info');
  });

  it('surfaces validation problems and warns', async () => {
    const app = await boot({
      configText: JSON.stringify({ rows: [{ left: [{ id: 'input', color: 'neon' }] }] }),
    });
    await app.runCommand();
    const message = app.notifications.at(-1)?.message ?? '';
    expect(message).toContain('unknown theme color "neon"');
    expect(app.notifications.at(-1)?.type).toBe('warning');
  });
});

describe('turn metrics', () => {
  it('feeds the tps module from the decode window and reports ttft alongside it', async () => {
    const app = await boot({ configText: JSON.stringify({ rows: [{ left: ['tps'], right: [] }] }) });
    vi.useFakeTimers();
    const emit = async (event: string, payload: unknown): Promise<void> => {
      await app.handlers.get(event)?.(payload, {});
    };

    await emit('message_start', { type: 'message_start', message: { role: 'assistant' } });
    await emit('before_provider_request', { type: 'before_provider_request', payload: {} });
    vi.advanceTimersByTime(300);
    await emit('message_update', {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'hello' },
    });
    vi.advanceTimersByTime(1000);
    await emit('message_end', {
      type: 'message_end',
      message: { role: 'assistant', usage: { output: 100 } },
    });

    // 100 tokens over a 1.0s decode window, anchored 300ms after the request.
    expect(app.render(60).trim()).toBe('ϟ 100/s');
    await app.runCommand();
    const message = app.notifications.at(-1)?.message ?? '';
    expect(message).toContain('ttft 300ms · decode 1.0s · 100 tok/s');
  });

  it('reports no rate for a burst arrival, and keeps the tps module hidden', async () => {
    const app = await boot({ configText: JSON.stringify({ rows: [{ left: ['tps'], right: [] }] }) });
    vi.useFakeTimers();
    const emit = async (event: string, payload: unknown): Promise<void> => {
      await app.handlers.get(event)?.(payload, {});
    };

    await emit('message_start', { type: 'message_start', message: { role: 'assistant' } });
    await emit('before_provider_request', { type: 'before_provider_request', payload: {} });
    vi.advanceTimersByTime(120);
    await emit('message_update', {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'hello' },
    });
    vi.advanceTimersByTime(50);
    await emit('message_end', {
      type: 'message_end',
      message: { role: 'assistant', usage: { output: 82 } },
    });

    expect(app.render(60).trim()).toBe('');
    await app.runCommand();
    const message = app.notifications.at(-1)?.message ?? '';
    expect(message).toContain('ttft 120ms');
    expect(message).toContain('no measurable rate');
  });
});
