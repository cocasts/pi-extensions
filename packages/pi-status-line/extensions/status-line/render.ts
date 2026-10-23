/**
 * The layout engine: one or more rows, each split into a left and a right group, and a fixed order
 * in which modules give up their seat as the terminal narrows.
 *
 * The reference footer hard-coded both its two rows and the shrink ladder inside one function. Here
 * the rows are configuration and the ladder is data — each module's registry `priority` — so the
 * renderer only has to drop the lowest priority on the row that overflows and re-measure it. Each
 * row shrinks on its own, so a long working directory never costs the metrics their seats. Floor
 * modules (context) are never dropped by that pass; when even they do not fit, the row degrades to a
 * plain truncation instead of a half-rendered module.
 */

import type { Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';

import { type ResolvedEntry, renderModule, type StatusLineParts } from './modules.ts';

/** Minimum air between the left and right groups of one row. */
const GROUP_GAP = 2;

/** One row of the footer: a left group and a right group, each with its own separator. */
export interface Row {
  left: ResolvedEntry[];
  right: ResolvedEntry[];
  divider: string;
  rightDivider: string;
}

/** A layout is the rows after config resolution. */
export interface Layout {
  rows: Row[];
}

interface Placed {
  entry: ResolvedEntry;
  side: 'left' | 'right';
}

interface ComposedRow {
  left: string;
  right: string;
  /** The width the row needs; zero when the row has nothing to show. */
  needed: number;
  /** How many modules actually rendered this frame. */
  count: number;
}

/** Joins one group's module strings, skipping modules that have nothing to show this frame. */
function composeGroup(
  theme: Theme,
  entries: readonly ResolvedEntry[],
  parts: StatusLineParts,
  divider: string,
): { text: string; count: number } {
  const sep = divider === '' ? '' : theme.fg('dim', divider);
  const rendered = entries
    .map((entry) => renderModule(theme, entry, parts))
    .filter((text): text is string => text !== null);
  return { text: rendered.join(sep), count: rendered.length };
}

/** The row as it currently reads, with visible modules only. */
function composeRow(
  theme: Theme,
  configRow: Row,
  placed: readonly Placed[],
  parts: StatusLineParts,
  dropped: ReadonlySet<Placed>,
): ComposedRow {
  const visible = placed.filter((item) => !dropped.has(item));
  const left = composeGroup(
    theme,
    visible.filter((item) => item.side === 'left').map((item) => item.entry),
    parts,
    configRow.divider,
  );
  const right = composeGroup(
    theme,
    visible.filter((item) => item.side === 'right').map((item) => item.entry),
    parts,
    configRow.rightDivider,
  );
  const needed =
    left.text === '' && right.text === ''
      ? 0
      : visibleWidth(left.text) + (right.text === '' ? 0 : GROUP_GAP + visibleWidth(right.text));
  return { left: left.text, right: right.text, needed, count: left.count + right.count };
}

/** Left group and right group on one line, padded to `width`. */
export function row(theme: Theme, width: number, left: string, right: string): string {
  const leftWidth = visibleWidth(left);
  const rightWidth = right === '' ? 0 : visibleWidth(right);
  if (leftWidth > 0 && rightWidth > 0) {
    if (leftWidth + rightWidth <= width) {
      return left + ' '.repeat(width - leftWidth - rightWidth) + right;
    }
    // Both groups exist but the row is too wide even after shrinking: keep the left group and
    // cut the right one, which is how the native footer spends its last columns.
    const available = width - leftWidth - GROUP_GAP;
    if (available > 0) {
      const truncated = truncateToWidth(right, available, '');
      const truncatedWidth = visibleWidth(truncated);
      return left + ' '.repeat(Math.max(0, width - leftWidth - truncatedWidth)) + truncated;
    }
    return truncateToWidth(left, width, theme.fg('dim', '…'));
  }
  if (rightWidth > 0) {
    return truncateToWidth(' '.repeat(Math.max(0, width - rightWidth)) + right, width, theme.fg('dim', '…'));
  }
  return truncateToWidth(left, width, theme.fg('dim', '…'));
}

/**
 * Shrinks one row until it fits, then paints it.
 *
 * Modules render in the order the user listed them on their side. When the row overflows, its
 * lowest-priority non-floor module is removed, whichever side it sits on, and the row is measured
 * again — so a right-side module can outlive a left-side one if its priority says so.
 */
function renderRow(theme: Theme, width: number, configRow: Row, parts: StatusLineParts): string | null {
  const placed: Placed[] = [
    ...configRow.left.map((entry): Placed => ({ entry, side: 'left' })),
    ...configRow.right.map((entry): Placed => ({ entry, side: 'right' })),
  ];
  const droppable = placed
    .filter((item) => !item.entry.def.floor)
    .sort((a, b) => a.entry.def.priority - b.entry.def.priority);

  const dropped = new Set<Placed>();
  let composed = composeRow(theme, configRow, placed, parts, dropped);
  for (const item of droppable) {
    if (composed.needed <= width) break;
    // The last module on a row truncates rather than vanishing: a narrow footer still names the
    // directory, and a lone context reading still shows its percentage.
    if (composed.count <= 1) break;
    dropped.add(item);
    composed = composeRow(theme, configRow, placed, parts, dropped);
  }

  if (composed.needed === 0) return null;
  return row(theme, width, composed.left, composed.right);
}

/**
 * The whole status line, one string per configured row.
 *
 * Rows with nothing to show are omitted rather than rendered blank. A footer component must return
 * at least one line, so an explicitly cleared layout renders one blank row.
 */
export function renderStatusLine(theme: Theme, width: number, layout: Layout, parts: StatusLineParts): string[] {
  const lines: string[] = [];
  for (const row of layout.rows) {
    const line = renderRow(theme, width, row, parts);
    if (line !== null) lines.push(line);
  }
  return lines.length === 0 ? [''] : lines;
}

export { GROUP_GAP };
