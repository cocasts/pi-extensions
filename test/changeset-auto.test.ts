import { describe, expect, it } from 'vitest';
import {
  type Commit,
  changesetsFromCommits,
  difference,
  groupCommits,
  isBreakingChange,
  isConventionalCommit,
} from '../scripts/changeset-auto.ts';

describe('automatic changesets', () => {
  it('recognizes supported Conventional Commit subjects', () => {
    expect(isConventionalCommit('feat(image-view): add zoom')).toBe(true);
    expect(isConventionalCommit('fix!: remove legacy behavior')).toBe(true);
    expect(isConventionalCommit('Merge pull request #1')).toBe(false);
  });

  it('recognizes breaking changes from subjects and commit bodies', () => {
    expect(isBreakingChange('feat(image-view)!: replace marker format')).toBe(true);
    expect(isBreakingChange('feat(image-view): replace marker format\n\nBREAKING CHANGE: markers changed')).toBe(true);
    expect(isBreakingChange('feat(image-view): add marker format')).toBe(false);
  });

  it('associates non-conventional commits with the nearest conventional commit', () => {
    const commits: Commit[] = [
      { hash: 'a', subject: 'WIP', body: 'WIP' },
      { hash: 'b', subject: 'feat(image-view): add zoom', body: 'feat(image-view): add zoom' },
      { hash: 'c', subject: 'address review', body: 'address review' },
      { hash: 'd', subject: 'fix(image-view): preserve size', body: 'fix(image-view): preserve size' },
    ];

    expect(groupCommits(commits)).toEqual([
      {
        summary: 'feat(image-view): add zoom',
        commits: [commits[0], commits[1], commits[2]],
      },
      {
        summary: 'fix(image-view): preserve size',
        commits: [commits[3]],
      },
    ]);
  });

  it('maps touched packages and commit types to release bumps', () => {
    const commits: Commit[] = [
      { hash: 'a', subject: 'feat(image-view): add zoom', body: 'feat(image-view): add zoom' },
      { hash: 'b', subject: 'fix(root): update tooling', body: 'fix(root): update tooling' },
    ];
    const filesByCommit = new Map([
      ['a', ['packages/pi-image-view/extensions/image-view/index.ts']],
      ['b', ['package.json']],
    ]);

    expect(
      changesetsFromCommits(
        groupCommits(commits),
        [{ name: '@cocasts/pi-image-view', dir: 'packages/pi-image-view' }],
        (hash) => filesByCommit.get(hash) ?? [],
      ),
    ).toEqual([
      {
        summary: 'feat(image-view): add zoom',
        releases: [{ name: '@cocasts/pi-image-view', type: 'minor' }],
      },
    ]);
  });

  it('does not regenerate an existing changeset', () => {
    const generated = [
      {
        summary: 'fix(image-view): preserve size',
        releases: [{ name: '@cocasts/pi-image-view', type: 'patch' as const }],
      },
    ];

    expect(difference(generated, generated)).toEqual([]);
  });
});
