import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Theme {
  $schema?: string;
  name?: string;
  appearance?: string;
  vars: Record<string, string>;
  colors: Record<string, string>;
  export: Record<string, string>;
}

const theme = JSON.parse(readFileSync(new URL('../themes/nord.json', import.meta.url), 'utf8')) as Theme;

const requiredColorRoles = [
  'accent',
  'border',
  'borderAccent',
  'borderMuted',
  'success',
  'error',
  'warning',
  'muted',
  'dim',
  'text',
  'thinkingText',
  'selectedBg',
  'scrollbarTrack',
  'scrollbarThumb',
  'searchMatchBg',
  'searchMatchText',
  'userMessageBg',
  'userMessageText',
  'customMessageBg',
  'customMessageText',
  'customMessageLabel',
  'toolPendingBg',
  'toolSuccessBg',
  'toolErrorBg',
  'toolTitle',
  'toolOutput',
  'mdHeading',
  'mdLink',
  'mdLinkUrl',
  'mdCode',
  'mdCodeBlock',
  'mdCodeBlockBorder',
  'mdQuote',
  'mdQuoteBorder',
  'mdHr',
  'mdListBullet',
  'toolDiffAdded',
  'toolDiffRemoved',
  'toolDiffContext',
  'syntaxComment',
  'syntaxKeyword',
  'syntaxFunction',
  'syntaxVariable',
  'syntaxString',
  'syntaxNumber',
  'syntaxType',
  'syntaxOperator',
  'syntaxPunctuation',
  'thinkingOff',
  'thinkingMinimal',
  'thinkingLow',
  'thinkingMedium',
  'thinkingHigh',
  'thinkingXhigh',
  'thinkingMax',
  'bashMode',
] as const;

const hexColor = /^#[\da-f]{6}$/i;

describe('Nord theme', () => {
  it('declares the published Pi schema and dark Nord identity', () => {
    expect(theme).toMatchObject({
      $schema: 'https://pi.dev/schemas/theme.schema.json',
      name: 'nord',
      appearance: 'dark',
    });
  });

  it('defines every required Pi color role', () => {
    expect(Object.keys(theme.colors)).toEqual(requiredColorRoles);
  });

  it('uses valid literals or declared variables for every color value', () => {
    const isValidColor = (value: string) => hexColor.test(value) || Object.hasOwn(theme.vars, value);

    for (const [name, value] of Object.entries(theme.vars)) {
      expect(isValidColor(value), `vars.${name} references "${value}"`).toBe(true);
    }
    for (const [name, value] of Object.entries(theme.colors)) {
      expect(isValidColor(value), `colors.${name} references "${value}"`).toBe(true);
    }
    for (const [name, value] of Object.entries(theme.export)) {
      expect(isValidColor(value), `export.${name} references "${value}"`).toBe(true);
    }
  });
});
