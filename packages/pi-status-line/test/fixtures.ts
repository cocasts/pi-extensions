import type { Theme } from '@earendil-works/pi-coding-agent';

import { MODULES, type ResolvedEntry, type StatusLineParts } from '../extensions/status-line/modules.ts';

/** A theme that adds no escapes, so rendered text can be compared and measured directly. */
export const plainTheme = { fg: (_color: string, text: string) => text } as unknown as Theme;

export function parts(overrides: Partial<StatusLineParts> = {}): StatusLineParts {
  return {
    model: 'anthropic/claude-sonnet-4',
    provider: 'clinepass',
    effort: 'medium',
    path: '~/dev/app',
    branch: 'main',
    session: 'fix-footer',
    input: 35_213,
    output: 1240,
    cacheHitRate: 99.83,
    tps: '82',
    contextTokens: 34_000,
    contextWindow: 200_000,
    contextPercent: 17,
    cost: 0.42,
    ...overrides,
  };
}

export function entry(id: keyof typeof MODULES, overrides: Partial<ResolvedEntry> = {}): ResolvedEntry {
  const def = MODULES[id];
  return {
    def,
    label: def.defaultLabel,
    format: def.defaultFormat,
    color: null,
    prefix: '',
    suffix: '',
    ...overrides,
  };
}
