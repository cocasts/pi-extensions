import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  private?: boolean;
  packageManager?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const changesetConfig = JSON.parse(readFileSync(new URL('../.changeset/config.json', import.meta.url), 'utf8')) as {
  access?: string;
  baseBranch?: string;
  changelog?: string;
  commit?: boolean;
  fixed?: string[][];
  linked?: string[][];
  updateInternalDependencies?: string;
};

const releaseWorkflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

describe('release configuration', () => {
  it('uses Changesets with Bun workspace scripts', () => {
    expect(rootPackage.private).toBe(true);
    expect(rootPackage.packageManager).toMatch(/^bun@\d+\.\d+\.\d+$/);
    expect(rootPackage.scripts).toMatchObject({
      changeset: 'changeset',
      'changeset:auto': 'bun scripts/changeset-auto.ts',
      'version-packages': 'changeset version && bun install',
      release: 'bun run verify && changeset publish',
    });
    expect(rootPackage.devDependencies).toMatchObject({
      '@changesets/cli': expect.any(String),
      '@changesets/read': expect.any(String),
      '@changesets/write': expect.any(String),
      '@manypkg/get-packages': expect.any(String),
    });
  });

  it('uses independent public package releases from main', () => {
    expect(changesetConfig).toMatchObject({
      access: 'public',
      baseBranch: 'main',
      changelog: '@changesets/cli/changelog',
      commit: false,
      fixed: [],
      linked: [],
      updateInternalDependencies: 'patch',
    });
  });

  it('creates release pull requests and publishes through Changesets Action', () => {
    expect(releaseWorkflow).toContain('push:');
    expect(releaseWorkflow).toContain('- main');
    expect(releaseWorkflow).toContain('bun run verify');
    expect(releaseWorkflow).toContain('changesets/action@v1');
    expect(releaseWorkflow).toContain('version: bun run version-packages');
    expect(releaseWorkflow).toContain('publish: bun run release');
    expect(releaseWorkflow).toMatch(/NPM_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  });
});
