import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name?: string;
  author?: string;
  keywords?: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  files?: string[];
  pi?: { extensions?: string[] };
  publishConfig?: { access?: string };
};

describe('package metadata', () => {
  it('declares Pi host packages as wildcard peers instead of installable dependencies', () => {
    expect(packageJson.peerDependencies).toMatchObject({
      '@earendil-works/pi-coding-agent': '*',
      '@earendil-works/pi-tui': '*',
    });
    expect(packageJson.dependencies ?? {}).not.toHaveProperty('@earendil-works/pi-coding-agent');
    expect(packageJson.dependencies ?? {}).not.toHaveProperty('@earendil-works/pi-tui');
  });

  it('publishes package discovery metadata for the Pi Gallery', () => {
    expect(packageJson.name).toBe('@cocasts/pi-status-line');
    expect(packageJson.author).toBe('moecasts <moecasts.caster@gmail.com>');
    expect(packageJson.pi?.extensions).toEqual(['./extensions/status-line/index.ts']);
    expect(packageJson.keywords).toContain('pi-package');
    expect(packageJson.publishConfig?.access).toBe('public');
  });

  it('publishes only extension resources and package documentation', () => {
    expect(packageJson.files).toEqual(['extensions/', 'README.md', 'CHANGELOG.md', 'LICENSE']);
  });
});
