# @cocasts/pi-image-view

Paste screenshots into the [pi coding agent](https://pi.dev) as compact, private `[🖼️ #N]` references instead of local file paths.

## Features

- Replaces pasted, typed, or dropped image paths with atomic `[🖼️ #N]` markers.
- Sends compact 480px previews to the model, with one-shot 1280px detail mode.
- Shows uniform, color-matched draft previews above the editor.
- Stores content-addressed image blobs for clickable conversation history.
- Reads the clipboard directly on macOS, Windows, WSL, Wayland, and supported X11 desktops.
- Upgrades screenshot tool results that contain saved image paths.
- Keeps legacy `[Image #N]` session references readable.

```text
# Before                                  # After
/var/folders/9x/T/screenshot 3.png        [🖼️ #1]
Help me resolve this conflict.            Help me resolve this conflict.
```

The model receives the `[🖼️ #N]` reference plus a compact 480px thumbnail attachment (1280px after `/pi-image-view detail`). It never receives the local path.

## Requirements

- A current [pi coding agent](https://pi.dev) installation.
- PNG, JPEG/JPG, GIF, or WebP images up to 50 MB.
- A Kitty-graphics-compatible terminal for inline thumbnails. Text markers and fallback previews work without it.

## Installation

```bash
# from a local checkout of this monorepo
pi install ./packages/pi-image-view

# or try it for one run
pi -e ./packages/pi-image-view
```

If pi is already running, `/reload` picks up a fresh install.

## Usage

| Action | Key | Behavior |
| --- | --- | --- |
| Paste image | `Ctrl+V` / `Alt+V` | Inserts `[🖼️ #N]` directly (macOS, Windows, WSL, supported Linux desktops). |
| Paste text / type a path | — | Image paths in the text are detected and replaced within ~250ms. |
| Drag & drop a file | — | The dropped path is detected and replaced. |
| Move across a marker | `←` / `→` | Jumps the whole `[🖼️ #N]` marker. |
| Delete a marker | `Backspace` / `Delete` | Removes the whole marker; the preview above the editor updates immediately. |

## Commands

| Command | Effect |
| --- | --- |
| `/pi-image-view clear` | Drop images already in the session from **future** model requests. Resets on a new session or `/reload`. |
| `/pi-image-view detail` | Send the **next** image batch at 1280px instead of 480px, then revert. |

## Terminal support

The widget renders each pending image in a fixed 16 × 6 cell frame that matches its marker color.

- kitty, Ghostty, WezTerm, and other Kitty-graphics-compatible terminals display inline thumbnails.
- tmux 3.3a+ requires `set -g allow-passthrough all`.
- Other terminals display bordered marker boxes; very narrow terminals fall back to a plain marker list.

## How it works

1. The extension reads a pasted image or detects an image path in the editor.
2. It replaces the path with an atomic `[🖼️ #N]` marker and renders a draft preview.
3. On submission, it creates a best-effort thumbnail and attaches it to the model request.
4. It stores the submitted bytes in a content-addressed local blob and makes the history marker clickable.
5. Before each model call, it removes the local link target from message text.

Resizing is best-effort: conversion failures fall back to the resized image when available, then to the original image. An attachment is not dropped solely because resizing failed.

## Formats and limits

- **Formats**: PNG, JPEG/JPG, GIF (first frame), WebP
- **Source size limit**: 50 MB; larger files are skipped
- **Blob store**: `~/.pi/agent/image-view/blobs/` (honors `PI_CODING_AGENT_DIR`)
- **Debug logging**: `PI_IMAGE_VIEW_DEBUG=1 pi`

Blobs are not deleted automatically because sessions may live under multiple configured roots. Remove files from the blob directory manually when they are no longer needed; historical markers remain as text.

## Privacy

Clickable history references store absolute local `file://` blob paths in the session JSONL. Targets are stripped from model-facing context, but raw session exports reveal local paths and will not resolve on another machine. Review session data before sharing.

## Development

```bash
bun install        # from the monorepo root
bun run verify     # TypeScript 7 + Biome checks + Vitest
bun run format     # format with Biome
bun run test       # vitest only
```

## Acknowledgements

Inspired by [alchemistklk/pi-image-view](https://github.com/alchemistklk/pi-image-view).

## Author

**moecasts** — <moecasts.caster@gmail.com>

## License

MIT — see [LICENSE](./LICENSE).
