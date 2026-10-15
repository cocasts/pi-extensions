import { type Component, getCapabilities, type ImageProtocol, visibleWidth } from '@earendil-works/pi-tui';
import { imageMarkerNumber } from './marker.ts';

function detectImageProtocol(): ImageProtocol | null {
  const caps = getCapabilities();
  if (caps.images) return caps.images;
  const inTmux = Boolean(process.env.TMUX) || (process.env.TERM?.toLowerCase() || '').startsWith('tmux');
  if (!inTmux) return null;
  const program = process.env.TERM_PROGRAM?.toLowerCase() || '';
  if (
    process.env.KITTY_WINDOW_ID ||
    program === 'kitty' ||
    program === 'ghostty' ||
    process.env.GHOSTTY_RESOURCES_DIR ||
    program === 'wezterm' ||
    process.env.WEZTERM_PANE
  )
    return 'kitty';
  return null;
}

export interface GalleryTheme {
  accent: (s: string) => string;
  muted: (s: string) => string;
  /** Border/frame color for the preview boxes (omp-style colored frames). */
  border: (s: string) => string;
  /** Stable per-image color shared by its frame and marker label. */
  image?: (markerNumber: number, s: string) => string;
}

/** A draft-scoped key makes duplicate attachments and raw-to-preview updates unambiguous. */
export interface GalleryImage {
  key: string;
  data: string;
  mimeType: string;
}

/** Every thumbnail renders into the same fixed cell box so previews stay uniform. */
export const THUMB_COLUMNS = 16;
export const THUMB_ROWS = 6;
/** Inner width of one bordered cell: the image plus the two frame columns. */
export const CELL_COLUMNS = THUMB_COLUMNS + 2;
const GAP = 2;
const MAX_GRID_ROWS = 3;
/** How many bordered boxes the plain-text fallback renders before summarizing. */
const MAX_TEXT_BOXES = 6;
let nextImageId = 1;

function allocateImageId(): number {
  const id = nextImageId;
  nextImageId = (nextImageId % 0xffffff) + 1;
  return id;
}

const ROW_COL_DIACRITICS = [
  0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f, 0x0346, 0x034a, 0x034b, 0x034c, 0x0350, 0x0351,
  0x0352, 0x0353,
];
const PLACEHOLDER_CHAR = String.fromCodePoint(0x10eeee);
const diacriticFor = (n: number) => String.fromCodePoint(ROW_COL_DIACRITICS[n] ?? ROW_COL_DIACRITICS[0]!);

function wrapForTmux(sequence: string): string {
  if (!process.env.TMUX) return sequence;
  return sequence.replace(
    /\x1b_G([^\x1b]*)\x1b\\/g,
    (_match, content) => `\x1bPtmux;\x1b\x1b_G${content}\x1b\x1b\\\x1b\\`,
  );
}

function write(sequence: string): void {
  process.stdout.write(wrapForTmux(sequence));
}

function transmit(data: string, id: number, columns: number, rows: number): void {
  const chunkSize = 4096;
  if (data.length <= chunkSize) {
    write(`\x1b_Ga=T,U=1,f=100,i=${id},c=${columns},r=${rows},q=2;${data}\x1b\\`);
    return;
  }
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.slice(offset, offset + chunkSize);
    const first = offset === 0;
    const last = offset + chunkSize >= data.length;
    const controls = first ? `a=T,U=1,f=100,i=${id},c=${columns},r=${rows},q=2,m=1` : `m=${last ? 0 : 1}`;
    write(`\x1b_G${controls};${chunk}\x1b\\`);
  }
}

function deleteImage(id: number): void {
  write(`\x1b_Ga=d,d=I,i=${id},q=2\x1b\\`);
}

function placeholderRow(imageId: number, row: number, columns: number): string {
  const r = (imageId >> 16) & 0xff;
  const g = (imageId >> 8) & 0xff;
  const b = imageId & 0xff;
  const start = imageId < 256 ? `\x1b[38;5;${imageId}m` : `\x1b[38;2;${r};${g};${b}m`;
  return (
    start +
    PLACEHOLDER_CHAR +
    diacriticFor(row) +
    diacriticFor(0) +
    PLACEHOLDER_CHAR.repeat(Math.max(0, columns - 1)) +
    '\x1b[39m'
  );
}

/** Center a plain label inside `columns` visible cells, mid-abbreviating long names. */
function fitLabel(label: string, columns: number): string {
  if (visibleWidth(label) > columns)
    label = `${label.slice(0, Math.ceil((columns - 1) / 2))}…${label.slice(-Math.floor((columns - 1) / 2))}`;
  const width = visibleWidth(label);
  const left = Math.floor(Math.max(0, columns - width) / 2);
  return ' '.repeat(left) + label + ' '.repeat(Math.max(0, columns - width - left));
}

/** Draft keys are the full `[🖼️ #N]` marker; previews show the bare `🖼️ #N` reference. */
function markerReference(key: string): string {
  return key.startsWith('[') && key.endsWith(']') ? key.slice(1, -1) : key;
}

type Resource = {
  image: GalleryImage;
  id: number;
};

/**
 * A keyed gallery retains terminal resources across draft updates. `setImages` is
 * reconciliation input; removing an absent key releases that key immediately, while
 * transmission and deletion writes occur from `render` or `dispose`.
 *
 * Every image renders inside an identical colored frame: a fixed THUMB_COLUMNS ×
 * THUMB_ROWS cell box wrapped in rounded box-drawing borders. Each row uses every
 * cell that fits the available width. All previews share one uniform size regardless
 * of the source aspect ratio or how many images are attached.
 */
export class ImageGallery implements Component {
  private images: GalleryImage[] = [];
  private readonly theme: GalleryTheme;
  private cachedLines?: string[];
  private cachedWidth?: number;
  private readonly resources = new Map<string, Resource>();
  private renderedProtocol: ImageProtocol | null | undefined;
  /** False after a renderer reset: IDs remain ours, but terminal image data must be sent again. */
  private terminalResidencyKnown = true;
  private disposed = false;

  constructor(theme: GalleryTheme) {
    this.theme = theme;
  }

  setImages(images: readonly GalleryImage[]): void {
    if (this.disposed) return;
    const next = [...images];
    const keys = new Set(next.map((image) => image.key));
    for (const [key, resource] of this.resources) {
      if (!keys.has(key)) {
        deleteImage(resource.id);
        this.resources.delete(key);
      }
    }
    this.images = next;
    this.cachedLines = undefined;
    this.cachedWidth = undefined;
  }

  invalidate(): void {
    // Renderers may clear terminal images before invalidating components. Keep stable
    // IDs but require the next Kitty render to repopulate their image data.
    this.terminalResidencyKnown = false;
    this.cachedLines = undefined;
    this.cachedWidth = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const resource of this.resources.values()) deleteImage(resource.id);
    this.resources.clear();
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (this.disposed) return [];
    const protocol = detectImageProtocol();
    if (this.cachedLines && this.cachedWidth === width && this.renderedProtocol === protocol) return this.cachedLines;

    const lines: string[] = [];
    if (this.images.length === 0) return this.cache(lines, width, protocol);
    lines.push(
      this.theme.accent(this.images.length === 1 ? ' 🖼️ 1 image attached' : ` 🖼️ ${this.images.length} images attached`),
    );
    // Breathing room between the title and the framed previews.
    lines.push('');
    const kitty = protocol === 'kitty' && this.images.every((image) => image.mimeType === 'image/png');
    if (this.renderedProtocol !== undefined && this.renderedProtocol !== protocol) this.releaseAll();
    if (!kitty || width - 2 < CELL_COLUMNS) {
      // Without a graphics protocol (or below one cell of width) the previews
      // degrade to text: bordered label boxes, or a plain list on narrow widths.
      this.releaseAll();
      this.renderTextFallback(lines, width - 2 >= CELL_COLUMNS);
      this.terminalResidencyKnown = true;
      return this.cache(lines, width, protocol);
    }
    this.renderKitty(lines, width);
    this.terminalResidencyKnown = true;
    return this.cache(lines, width, protocol);
  }

  private cache(lines: string[], width: number, protocol: ImageProtocol | null): string[] {
    this.cachedLines = lines;
    this.cachedWidth = width;
    this.renderedProtocol = protocol;
    return lines;
  }

  private releaseAll(): void {
    for (const resource of this.resources.values()) deleteImage(resource.id);
    this.resources.clear();
  }

  private colorImage(image: GalleryImage, text: string): string {
    return this.theme.image?.(imageMarkerNumber(image.key) ?? 1, text) ?? this.theme.border(text);
  }

  private renderTextFallback(lines: string[], boxed: boolean): void {
    if (!boxed) {
      for (const image of this.images) {
        lines.push(`  ${this.colorImage(image, markerReference(image.key))}`);
      }
      return;
    }
    const visible = this.images.slice(0, MAX_TEXT_BOXES);
    for (const image of visible) {
      lines.push(this.colorImage(image, `╭${'─'.repeat(THUMB_COLUMNS)}╮`));
      const content = fitLabel(markerReference(image.key), THUMB_COLUMNS);
      lines.push(this.colorImage(image, '│') + this.colorImage(image, content) + this.colorImage(image, '│'));
      lines.push(this.colorImage(image, `╰${'─'.repeat(THUMB_COLUMNS)}╯`));
    }
    const hidden = this.images.length - visible.length;
    if (hidden > 0) lines.push(this.theme.muted(`  … and ${hidden} more image${hidden === 1 ? '' : 's'}`));
  }

  private renderKitty(lines: string[], width: number): void {
    const available = Math.max(0, width - 2);
    const perRow = Math.max(1, Math.floor((available + GAP) / (CELL_COLUMNS + GAP)));

    const infos: Resource[] = [];
    for (const image of this.images) {
      let resource = this.resources.get(image.key);
      const changed = resource && (resource.image.data !== image.data || resource.image.mimeType !== image.mimeType);
      if (changed && resource) {
        deleteImage(resource.id);
        this.resources.delete(image.key);
        resource = undefined;
      }
      if (resource) {
        resource.image = image;
        if (!this.terminalResidencyKnown) transmit(image.data, resource.id, THUMB_COLUMNS, THUMB_ROWS);
      } else {
        resource = { image, id: allocateImageId() };
        this.resources.set(image.key, resource);
        transmit(image.data, resource.id, THUMB_COLUMNS, THUMB_ROWS);
      }
      infos.push(resource);
    }

    const gridRows: Resource[][] = [];
    for (let offset = 0; offset < infos.length; offset += perRow) {
      gridRows.push(infos.slice(offset, offset + perRow));
    }
    const visibleGridRows = gridRows.slice(0, MAX_GRID_ROWS);
    const renderedCount = visibleGridRows.reduce((sum, row) => sum + row.length, 0);
    const hidden = infos.length - renderedCount;

    for (const gridRow of visibleGridRows) {
      const topBorders = gridRow.map((info) => this.colorImage(info.image, `╭${'─'.repeat(THUMB_COLUMNS)}╮`));
      lines.push(` ${topBorders.join(' '.repeat(GAP))}`);
      for (let row = 0; row < THUMB_ROWS; row += 1) {
        const cells = gridRow.map(
          (info) =>
            this.colorImage(info.image, '│') +
            placeholderRow(info.id, row, THUMB_COLUMNS) +
            this.colorImage(info.image, '│'),
        );
        lines.push(` ${cells.join(' '.repeat(GAP))}`);
      }
      const spacers = gridRow.map(
        (info) => this.colorImage(info.image, '│') + ' '.repeat(THUMB_COLUMNS) + this.colorImage(info.image, '│'),
      );
      lines.push(` ${spacers.join(' '.repeat(GAP))}`);
      const labels = gridRow.map(
        (info) =>
          this.colorImage(info.image, '│') +
          this.colorImage(info.image, fitLabel(markerReference(info.image.key), THUMB_COLUMNS)) +
          this.colorImage(info.image, '│'),
      );
      lines.push(` ${labels.join(' '.repeat(GAP))}`);
      const bottomBorders = gridRow.map((info) => this.colorImage(info.image, `╰${'─'.repeat(THUMB_COLUMNS)}╯`));
      lines.push(` ${bottomBorders.join(' '.repeat(GAP))}`);
    }
    if (hidden > 0) {
      lines.push(this.theme.muted(`  … and ${hidden} more image${hidden === 1 ? '' : 's'}`));
    }
  }
}
