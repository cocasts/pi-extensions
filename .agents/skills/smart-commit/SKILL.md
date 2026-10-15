---
name: smart-commit
description: Use when uncommitted Git changes need to be committed, split into logical commits, or organized into a commit plan.
---

# Smart Commit

## Goal

Split the current work into reviewable commits without losing changes or
silently changing the user's staging intent. Always present the exact plan
before mutating the index or creating commits.

## Required authority

Read `.agents/rules/git-commit.mdc` before writing any plan or commit message,
and read it again immediately before execution. Its format, type, scope, and
ordering rules override examples in this skill. If the file is missing, stop
and ask the user how commit messages should be formatted.

## Quick reference

| Situation | Required response |
| --- | --- |
| General request to commit now | Present the exact plan and wait |
| Unborn `HEAD` or untracked files | Inspect staged, unstaged, and untracked content separately |
| Existing index spans planned commits | Disclose the exact index-handling strategy |
| Worktree changes after approval | Stop, update the plan, and request approval again |

## Workflow

### 1. Inspect without mutation

Run:

```bash
git status --short --branch
git rev-parse --verify HEAD
git diff --cached
git diff
git ls-files --others --exclude-standard
```

If `HEAD` exists, also run `git diff HEAD`. An unborn branch makes that command
fail, and `git diff HEAD` never includes untracked files. Read relevant
untracked files separately.

Record each path as staged, unstaged, untracked, or partially staged. Do not
stage, unstage, restore, or commit while gathering context.

### 2. Group changes

Group by logical concern and dependency:

- Keep implementation, its types, and its tests together.
- Separate unrelated package, repository configuration, dependency, and agent
  changes.
- Avoid tiny commits when the files form one reviewable change.
- Follow the ordering rules in `.agents/rules/git-commit.mdc`, even when the
  user asks for the fewest possible commits.
- For every group, derive the type, scope/module, and lowercase English
  description from the rule file and actual diff.

### 3. Present the exact plan

List every commit in order with its file count, message, paths, and current
staging state:

```text
1. [3 files] feat(image-view/gallery): add preview navigation
   - [staged] packages/pi-image-view/src/image-gallery.ts
   - [unstaged] packages/pi-image-view/src/gallery-presenter.ts
   - [untracked] packages/pi-image-view/test/gallery-navigation.test.ts
```

Mention partial-file or hunk-level grouping explicitly. If existing staged
changes span multiple planned commits, include the exact index-handling
strategy in the plan.

Ask: **"Does this commit plan look good?"**

Stop and wait. A request such as "commit everything now" or "do not ask
questions" authorizes the task, but does not approve an unseen commit plan.
Do not mutate the index or create commits until the user explicitly approves
the presented plan.

### 4. Revalidate and execute

After approval:

1. Re-run the inspection commands. If paths, contents, or staging state changed,
   stop and present an updated plan.
2. Never use broad `git add .`, `git add -A`, `git reset`, or
   `git restore --staged` unless that exact index change was disclosed in the
   approved plan.
3. Stage only the approved paths or hunks.
4. Before each commit, inspect `git diff --cached --name-status` and
   `git diff --cached`; commit only when the index exactly matches the group.
5. Commit with the approved subject line only.
6. Run `git status --short --branch` after every commit and at the end.

If pre-existing staged content cannot be separated safely without changing
staging intent, stop and ask for approval of a concrete restaging strategy.
Never discard changes.

## Stop signs and common mistakes

If any of these occurs, stop and return to the relevant workflow step:

- Treating `git diff HEAD` as complete context.
- Ignoring staged versus unstaged versions of the same file.
- Copying types or scopes from examples instead of the repository rule file.
- Combining unrelated work merely to reduce commit count.
- Proceeding after a general commit request without approval of the exact plan.
- Silently restaging the user's index.
