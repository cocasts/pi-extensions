import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name?: string;
  version?: string;
  author?: string;
  keywords?: string[];
  files?: string[];
  dependencies?: Record<string, string>;
  pi?: { themes?: string[] };
  publishConfig?: { access?: string };
};

describe('package metadata', () => {
  it('publishes the theme package for Pi discovery', () => {
    expect(packageJson).toMatchObject({
      name: '@cocasts/pi-themes',
      version: '0.1.0',
      author: 'moecasts <moecasts.caster@gmail.com>',
      publishConfig: { access: 'public' },
      pi: { themes: ['./themes/*.json'] },
    });
    expect(packageJson.keywords).toContain('pi-package');
  });

  it('publishes only theme resources and package documentation', () => {
    expect(packageJson.files).toEqual(['themes/', 'README.md', 'CHANGELOG.md', 'LICENSE']);
    expect(packageJson.dependencies ?? {}).toEqual({});
  });
});
