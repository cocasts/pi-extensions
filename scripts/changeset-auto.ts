import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readChangesets } from '@changesets/read';
import { writeChangeset } from '@changesets/write';
import { getPackagesSync } from '@manypkg/get-packages';

const conventionalTypes = [
  'feat',
  'feature',
  'fix',
  'perf',
  'revert',
  'docs',
  'style',
  'chore',
  'refactor',
  'test',
  'build',
  'ci',
] as const;

const conventionalPrefix = new RegExp(`^(?:${conventionalTypes.join('|')})(?:\\([^)]*\\))?!?:`);
const breakingPrefix = new RegExp(`^(?:${conventionalTypes.join('|')})(?:\\([^)]*\\))?!:`);

export interface Commit {
  hash: string;
  subject: string;
  body: string;
}

export interface CommitGroup {
  summary: string;
  commits: Commit[];
}

export interface WorkspacePackage {
  name: string;
  dir: string;
}

export type ReleaseType = 'major' | 'minor' | 'patch';

export interface GeneratedChangeset {
  summary: string;
  releases: Array<{ name: string; type: ReleaseType }>;
}

export const isConventionalCommit = (message: string): boolean => conventionalPrefix.test(message);

export const isBreakingChange = (message: string): boolean =>
  breakingPrefix.test(message) || /(?:^|\n)BREAKING CHANGE:/m.test(message);

export const groupCommits = (commits: Commit[]): CommitGroup[] => {
  const groups: CommitGroup[] = [];
  let pending: Commit[] = [];

  for (const commit of commits) {
    if (isConventionalCommit(commit.subject)) {
      groups.push({
        summary: commit.subject,
        commits: [...pending, commit],
      });
      pending = [];
      continue;
    }

    if (groups.length === 0) {
      pending.push(commit);
    } else {
      groups[groups.length - 1].commits.push(commit);
    }
  }

  return groups;
};

const releaseTypeFor = (group: CommitGroup): ReleaseType => {
  const messages = group.commits.map((commit) => commit.body).join('\n');
  if (isBreakingChange(messages)) return 'major';
  if (/^(?:feat|feature)(?:\(|!|:)/.test(group.summary)) return 'minor';
  return 'patch';
};

export const changesetsFromCommits = (
  groups: CommitGroup[],
  packages: WorkspacePackage[],
  changedFilesForCommit: (hash: string) => string[],
): GeneratedChangeset[] =>
  groups.flatMap((group) => {
    const changedFiles = new Set(group.commits.flatMap((commit) => changedFilesForCommit(commit.hash)));
    const releases = packages
      .filter((pkg) => {
        const prefix = `${pkg.dir.replace(/\/+$/, '')}/`;
        return [...changedFiles].some((file) => file === pkg.dir || file.startsWith(prefix));
      })
      .map((pkg) => ({
        name: pkg.name,
        type: releaseTypeFor(group),
      }));

    return releases.length === 0 ? [] : [{ summary: group.summary, releases }];
  });

const changesetKey = (changeset: GeneratedChangeset): string => {
  const releases = [...changeset.releases].sort((left, right) => left.name.localeCompare(right.name));
  return JSON.stringify({ summary: changeset.summary, releases });
};

export const difference = (generated: GeneratedChangeset[], existing: GeneratedChangeset[]): GeneratedChangeset[] => {
  const existingKeys = new Set(existing.map(changesetKey));
  return generated.filter((changeset) => !existingKeys.has(changesetKey(changeset)));
};

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();

const changedFilesForCommit = (cwd: string, hash: string): string[] => {
  const output = git(cwd, 'diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-m', '--find-renames', hash);
  return output ? [...new Set(output.split('\n'))] : [];
};

const commitsSinceBase = (cwd: string, baseBranch: string): Commit[] => {
  execFileSync('git', ['fetch', 'origin', baseBranch], {
    cwd,
    stdio: 'inherit',
  });

  const baseRef = `origin/${baseBranch}`;
  const mergeBase = git(cwd, 'merge-base', 'HEAD', baseRef);
  const output = git(cwd, 'rev-list', '--reverse', `${mergeBase}..HEAD`);
  if (!output) return [];

  return output.split('\n').map((hash) => ({
    hash,
    subject: git(cwd, 'show', '-s', '--format=%s', hash),
    body: git(cwd, 'show', '-s', '--format=%B', hash),
  }));
};

interface ManyPkgResult {
  packages: Array<{
    relativeDir: string;
    packageJson: {
      name?: string;
      private?: boolean;
      version?: string;
    };
  }>;
}

export const runChangesets = async (cwd: string = process.cwd()): Promise<void> => {
  const config = JSON.parse(readFileSync(path.join(cwd, '.changeset/config.json'), 'utf8')) as {
    baseBranch?: string;
  };
  const baseBranch = config.baseBranch ?? 'main';
  const packageResult = getPackagesSync(cwd) as ManyPkgResult;
  const packages = packageResult.packages
    .filter((pkg) => !pkg.packageJson.private && pkg.packageJson.name && pkg.packageJson.version)
    .map((pkg) => ({
      name: pkg.packageJson.name!,
      dir: pkg.relativeDir,
    }));

  const commits = commitsSinceBase(cwd, baseBranch);
  const generated = changesetsFromCommits(groupCommits(commits), packages, (hash) => changedFilesForCommit(cwd, hash));
  const existing = (await readChangesets(cwd)) as GeneratedChangeset[];
  const newChangesets = difference(generated, existing);

  for (const changeset of newChangesets) {
    await writeChangeset(changeset, cwd, { format: false });
    console.log(`Created changeset: ${changeset.summary}`);
  }

  if (newChangesets.length === 0) {
    console.log('No new changesets were needed.');
  }
};

if (import.meta.main) {
  await runChangesets();
}
