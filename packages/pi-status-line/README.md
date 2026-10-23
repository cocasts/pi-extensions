# @cocasts/pi-status-line

A modular, multi-row status line for the [pi coding agent](https://pi.dev). Instead of a fixed
footer layout, you list which **modules** appear on each row's left and right, and how each one is
labelled, formatted, and coloured.

## Features

- Declares any number of footer rows, each with its own left and right module lists.
- Ships twelve built-in modules: model, provider, effort, path, branch, session, token volumes,
  cache hit rate, throughput, context pressure, and cost.
- Lets each module choose a label style, format preset, theme colour, and literal prefix/suffix.
- Shrinks each row on its own by module priority, keeping the context reading as a floor.
- Reports the effective layout, last-turn timing, and config problems through `/statusline`.
- Keeps rendering the usable entries when the config file is partly invalid.

The default layout mirrors pi's native footer:

```text
~/projects/pi-extensions (feature/status-line) • tidy-footer
↑ 35k · ↓ 1.2k · ◎ 99.8% · ϟ 82/s · $0.42 · 17.0%/1.0M     (anthropic) anthropic/claude-sonnet-4 • high
```

Everything renders `dim`, the way the native footer does; only context pressure borrows `warning`
(above 70 %) and `error` (above 90 %). Modules render in the order you list them, and a module with
nothing to say (no branch, no output yet, no rate yet, only one provider) disappears without
leaving a dangling separator.

## Requirements

- A current [pi coding agent](https://pi.dev) installation.
- A monospace terminal font that draws `↑ ↓ ◎ ϟ` in one cell. Otherwise use `label: "word"`.

## Installation

```bash
pi install npm:@cocasts/pi-status-line

# or try it for one run without installing
pi -e npm:@cocasts/pi-status-line
```

If pi is already running, `/reload` picks up a fresh install.

## Configuration

The config file is `status-line/config.json` inside pi's agent directory — by default
`~/.pi/agent/status-line/config.json`, or `$PI_CODING_AGENT_DIR/status-line/config.json` when that
override is set.

It is read at session start and on `/reload`. A missing file means the built-in defaults; an invalid
entry is skipped with one warning and the rest of the line still renders.

```jsonc
{
  "divider": " · ",
  "rows": [
    {
      "divider": " ",
      "left": ["path", "branch", { "id": "session", "prefix": "• " }]
    },
    {
      "left": [
        "input",
        "output",
        { "id": "cache-hit", "format": "hit" },
        "tps",
        "cost",
        { "id": "context", "format": "window" }
      ],
      "rightDivider": " ",
      "right": [
        "provider",
        { "id": "model", "format": "short" },
        { "id": "effort", "label": "word", "prefix": "• " }
      ]
    }
  ]
}
```

Top level:

| Field | Values | Meaning |
| --- | --- | --- |
| `rows` | array of `{ "left": [], "right": [] }` | Footer rows, top to bottom. A row with nothing to show is omitted. |
| `divider` | any string (default `" · "`) | Literal text between two modules on a row. |

A row accepts `left` and `right` module lists; an omitted side is empty. It may also override the
separator with `divider` (both sides), `leftDivider`, or `rightDivider` — the default layout uses
`" "` on the directory row and on the identity side so `~/app (main) • session` and
`(provider) model • level` read as phrases, while the readings keep the `·` beat. Every entry
accepts:

| Field | Values | Meaning |
| --- | --- | --- |
| `id` | a module id (below) | Which module to render. Unknown ids are skipped with a warning. |
| `label` | `glyph` · `word` · `none` | How the label reads. Omit for the module's default. |
| `format` | module-specific preset | Controls the value only. Omit for the module's default. |
| `color` | a pi theme token | Overrides the module's own colour. Omit to keep it (e.g. context pressure). |
| `prefix` / `suffix` | any string | Literal decoration around the whole module, rendered dim. Spaces are literal. |

A bare id is shorthand for `{ "id": "…" }`, so `"left": ["input", "context"]` also works. An empty
`rows` array clears the footer. The older single-row shape (`{ "left": [...], "right": [...] }`
without `rows`) is still read as one row, with the default metrics row for whichever side it omits.

### Labels

- `glyph` — one-cell symbol from the terminal's own monospace font, followed by a space: `↑ 35k`.
- `word` — the spelled-out label with a space: `input 35k`. Use this when a font draws a glyph wider
  than its cell.
- `none` — value only. The default for self-describing modules such as `model`, `context`, and
  `cost`.

### Colours

`color` accepts pi's foreground theme tokens (`accent`, `muted`, `success`, `error`, `warning`,
`syntaxString`, `thinkingLow`, …). Background tokens are rejected; run `/statusline` to validate a
name. Every module defaults to `dim`, matching the native footer. `context` keeps its dynamic
pressure colour unless you override it.

## Modules

Priority decides what leaves the footer first when the terminal narrows: **lowest priority is dropped
first**. `floor` modules are never dropped by the shrink pass.

| Module | Formats (default first) | Default label | Default colour | Priority | Floor |
| --- | --- | --- | --- | --- | --- |
| `session` | `name` | `none` | `dim` | 10 | no |
| `branch` | `paren` (`(main)`) · `name` (`main`) | `none` | `dim` | 15 | no |
| `path` | `full` (home-relative) · `tail` (last two segments) | `none` | `dim` | 20 | no |
| `tps` | `rate` (`82/s`) · `long` (`82 tok/s`) | `glyph` `ϟ` | `dim` | 30 | no |
| `effort` | `native` (`medium`, `thinking off`) · `word` (`medium`) · `initial` (`M`) | `none` | `dim` | 40 | no |
| `cache-hit` | `percent` (`99.8%`) · `hit` (`99.8% hit`) | `glyph` `◎` | `dim` | 50 | no |
| `output` | `tokens` · `exact` | `glyph` `↓` | `dim` | 60 | no |
| `cost` | `usd` (`$0.42`) · `exact` (`$0.4200`) | `none` | `dim` | 70 | no |
| `input` | `tokens` · `exact` | `glyph` `↑` | `dim` | 80 | no |
| `provider` | `paren` (`(anthropic)`) · `name` (`anthropic`) | `none` | `dim` | 85 | no |
| `model` | `id` · `short` (no provider prefix) | `none` | `dim` | 90 | no |
| `context` | `native` (`17.0%/200k`) · `window` (`34k/200k`) · `tokens` (`34k`) · `percent` (`17%`) | `none` | pressure colour | 1000 | **yes** |

Notes:

- `input` / `output` count session prompt tokens that were neither read from nor written to cache, and
  assistant output tokens. They hide while zero, as do `branch` (no repository), `session` (no name),
  `provider` (only one provider available), `cost` (nothing spent yet), `cache-hit` and `tps` (before
  the first turn).
- `tps` is the **latest turn**, not a session average: an average folds in cold-cache warm-up turns
  and reports a speed the route no longer has. `~82/s` marks an estimate; a bare `82/s` came from
  provider usage.
- `cost` is session spend in USD. A nonzero amount that rounds to nothing reads `$0.01`, never `$0`.
- `context` follows the native footer: one decimal of pressure over the abbreviated window, and `?`
  when pi withholds the share after a compaction. It is a floor and survives every shrink rung.

## Overflow

Each row shrinks on its own, so a long working directory never costs the metrics their seats. Within
a row, non-floor modules give up their seat one at a time in priority order — **whichever side they
sit on** — so:

```text
session → branch → path → tps → effort → cache-hit → output → cost → input → provider → model →
(context stays)
```

The directory row therefore keeps the path as long as it fits, dropping the session and branch tail
first, the way the native footer truncates its directory line from the right. A row never renders a
module half-cut: the last module on a row that still does not fit truncates with `…`. At
`width <= 0` the extension renders an empty line.

## Commands

| Command | Effect |
| --- | --- |
| `/statusline` | Print the effective rows, their resolved formatting, the last turn's timing, and any config problems. |

The report lists each row's module order and divider, every resolved `label` / `format` / `color`
with its source (default or config), each module's priority and floor flag, the last turn's timing
(`ttft`, decode window, rate), and any validation problems. When there are no problems it says so
explicitly.

The report describes what is loaded, not the file on disk — after editing the file, run `/reload`,
then `/statusline` to confirm what pi is actually showing.

## Turn metrics

The throughput reading follows the harness contract: a request opens at `before_provider_request`, the
first streamed delta freezes TTFT, and a finished message's rate is
`usage.output / ((messageEnd − firstToken) / 1000)`. A decode window shorter than 200 ms is treated as
a burst arrival and reports **no** rate rather than a confident fake; `/statusline` shows the last
turn's TTFT and decode window so the number is auditable.

## Design rules

- A glyph and a word both keep a space before the value (`↑ 35k`, `input 35k`); `none` leaves the
  value to speak for itself.
- Every glyph is one cell, drawn by the terminal's own monospace font, with no emoji presentation —
  two-cell or fallback-drawn glyphs overlap the following character. Use `label: "word"` if a font
  misbehaves.
- Values are dim by default, like pi's native footer; context pressure is the one dynamic colour.
  A configured `color` is an opt-in accent.
- Rendering is a pure function of `(theme, width, layout, parts)`. There is no timer: no module reads a
  clock, so the footer repaints on events rather than on a tick.
- A broken config never takes the footer down: parse problems are reported once, and the usable
  entries still render.

## Development

```bash
bun install        # from the monorepo root
bun run verify     # TypeScript 7 + Biome checks + Vitest
bun run format     # format with Biome
bun run test       # vitest only
```

To load the local package in pi:

```bash
pi -e ./packages/pi-status-line
```

## Author

**moecasts** — <moecasts.caster@gmail.com>

## License

MIT — see [LICENSE](./LICENSE).
