# pi-extensions

A monorepo of [pi coding agent](https://pi.dev) extensions (pi packages), managed with Bun workspaces.

## Packages

| Package | Path | Description |
| --- | --- | --- |
| `@cocasts/pi-image-view` | [`packages/pi-image-view`](packages/pi-image-view) | Paste image previews with `[🖼 #N]` icon markers and uniform-size thumbnails above the editor |

## Development

```bash
bun install          # install workspace dependencies
bun run verify       # typecheck + lint + test (all packages)
bun run test         # vitest across packages
bun run test:watch   # vitest watch mode
bun run typecheck    # TypeScript 7, tsc --noEmit per package
bun run lint         # Biome lint
bun run format       # Biome format (write)
bun run check        # Biome format + lint + import checks
```

Try a package in pi without installing:

```bash
pi -e ./packages/pi-image-view
```

## Adding a package

1. Create `packages/<name>/` with a `package.json` declaring:
   - `pi.extensions` pointing at the extension entry file(s)
   - `peerDependencies` on host-provided packages (`@earendil-works/*`, `typebox`) with `"*"` ranges — never `dependencies`
   - the `pi-package` keyword if it should appear in the public gallery
2. Give it `test` / `typecheck` scripts; the root `verify` picks them up automatically.

See [pi packages docs](https://pi.dev/docs/packages) for the manifest reference.

## Author

**moecasts** — <moecasts.caster@gmail.com>
