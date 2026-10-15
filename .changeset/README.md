# Changesets

After committing a change to a published package, generate its changeset:

```bash
bun run changeset:auto
```

The command compares the branch with `origin/main`, finds packages touched by
each Conventional Commit, and selects the SemVer bump automatically. Commit
the generated Markdown files with the pull request.

Run `bun run changeset` to use the interactive Changesets command when the
automatic package, bump, or summary needs to be overridden.

Changes that do not touch a published package, such as root-only repository
tooling, do not need a changeset.
