import type * as PiTui from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it, vi } from 'vitest';

const capabilities = vi.hoisted(() => ({ images: 'kitty' as 'kitty' | null }));

vi.mock('@earendil-works/pi-tui', async (importOriginal) => {
  const actual = await importOriginal<typeof PiTui>();
  return {
    ...actual,
    // Only the graphics-protocol probe is simulated; real width tables keep the
    // frame-alignment assertions honest for placeholder glyphs and emoji labels.
    getCapabilities: () => ({ images: capabilities.images }),
  };
});

import { visibleWidth } from '@earendil-works/pi-tui';
import { ImageGallery, THUMB_COLUMNS } from '../extensions/image-view/image-gallery.ts';

const plain = (text: string) => text;
const theme = {
  accent: plain,
  muted: plain,
  border: plain,
};
const taggedTheme = {
  ...theme,
  image: (markerNumber: number, text: string) => `<image-${markerNumber}>${text}</image-${markerNumber}>`,
};
// Two valid 1×1 PNG base64 payloads. Snapshot fixtures cycle them by key, while preview selects the other payload.
const PNG_FIXTURES = [
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/2QAAAABJRU5ErkJggg==',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Jm3cAAAAASUVORK5CYII=',
] as const;
const png = (key: string, data: string = PNG_FIXTURES[0]) => ({ key, data, mimeType: 'image/png' });

type Metrics = {
  galleryCreations: number;
  renders: number;
  updateRequests: number;
  pngPayloadBytes: number;
  controlBytes: number;
  deletes: number;
  liveIds: number;
};

function writesFor(action: () => void): string[] {
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    action();
    return write.mock.calls.map(([value]) => String(value));
  } finally {
    write.mockRestore();
  }
}

function transmittedIds(writes: readonly string[]): number[] {
  return writes.flatMap((line) => [...line.matchAll(/a=T[^;]*,i=(\d+)/g)].map((match) => Number(match[1])));
}

function deletedIds(writes: readonly string[]): number[] {
  return writes.flatMap((line) => [...line.matchAll(/a=d,d=I,i=(\d+)/g)].map((match) => Number(match[1])));
}

function metric(writes: readonly string[], galleryCreations: number, renders: number, updateRequests: number): Metrics {
  let pngPayloadBytes = 0;
  let controlBytes = 0;
  for (const line of writes) {
    const payloadMatch = /\x1b_G([^;]*);([^\x1b]*)\x1b\\/.exec(line);
    if (payloadMatch) {
      const [, controls, payload] = payloadMatch;
      if (controls.includes('a=T') || controls.startsWith('m=')) pngPayloadBytes += payload.length;
      controlBytes += line.length - payload.length;
    } else {
      controlBytes += line.length;
    }
  }
  const transmitted = new Set(transmittedIds(writes));
  for (const id of deletedIds(writes)) transmitted.delete(id);
  return {
    galleryCreations,
    renders,
    updateRequests,
    pngPayloadBytes,
    controlBytes,
    deletes: deletedIds(writes).length,
    liveIds: transmitted.size,
  };
}

function staggeredSnapshots(count: number): Array<ReturnType<typeof png>[]> {
  let current = Array.from({ length: count }, (_, index) =>
    png(`image-${index}`, PNG_FIXTURES[index % PNG_FIXTURES.length]),
  );
  const snapshots = [current];
  for (let index = 0; index < count; index += 1) {
    current = current.map((item, itemIndex) =>
      itemIndex === index ? png(item.key, PNG_FIXTURES[(index + 1) % PNG_FIXTURES.length]) : item,
    );
    snapshots.push(current);
  }
  return snapshots;
}

function withoutTmux<T>(action: () => T): T {
  const previousTmux = process.env.TMUX;
  delete process.env.TMUX;
  try {
    return action();
  } finally {
    if (previousTmux === undefined) delete process.env.TMUX;
    else process.env.TMUX = previousTmux;
  }
}

/** Ignores terminals whose environment alone implies Kitty-graphics support. */
function withoutImageProgramEnv<T>(action: () => T): T {
  const keys = ['TMUX', 'KITTY_WINDOW_ID', 'TERM_PROGRAM', 'GHOSTTY_RESOURCES_DIR', 'WEZTERM_PANE', 'TERM'] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  try {
    return action();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

/** Measured old behavior: a fresh gallery is created and rendered for each complete snapshot. */
function measureFullRebuildBaseline(snapshots: readonly (readonly ReturnType<typeof png>[])[]): Metrics {
  let galleryCreations = 0;
  let renders = 0;
  let updateRequests = 0;
  const writes = withoutTmux(() =>
    writesFor(() => {
      let previous: ImageGallery | undefined;
      for (const snapshot of snapshots) {
        previous?.dispose();
        const gallery = new ImageGallery(theme);
        galleryCreations += 1;
        gallery.setImages(snapshot);
        updateRequests += 1;
        gallery.render(200);
        renders += 1;
        previous = gallery;
      }
      previous?.dispose();
    }),
  );
  return metric(writes, galleryCreations, renders, updateRequests);
}

function measureIncremental(snapshots: readonly (readonly ReturnType<typeof png>[])[]): Metrics {
  let galleryCreations = 0;
  let renders = 0;
  let updateRequests = 0;
  const writes = withoutTmux(() =>
    writesFor(() => {
      const gallery = new ImageGallery(theme);
      galleryCreations += 1;
      for (const snapshot of snapshots) {
        gallery.setImages(snapshot);
        updateRequests += 1;
        gallery.render(200);
        renders += 1;
      }
      gallery.dispose();
    }),
  );
  return metric(writes, galleryCreations, renders, updateRequests);
}

describe('image gallery format safety', () => {
  afterEach(() => {
    capabilities.images = 'kitty';
  });

  it('falls back to text when Kitty f=100 receives a non-PNG image', () => {
    const writes = writesFor(() => {
      const gallery = new ImageGallery(theme);
      gallery.setImages([{ key: '[🖼️ #1]', data: 'jpeg', mimeType: 'image/jpeg' }]);
      const lines = gallery.render(80);
      expect(lines.join('\n')).toContain('🖼️ #1');
      expect(lines.some((line) => line.startsWith('╭') && line.endsWith('╮'))).toBe(true);
      expect(lines.some((line) => line.startsWith('╰') && line.endsWith('╯'))).toBe(true);
    });
    expect(writes).toEqual([]);
  });

  it('retains unchanged resources while adding or replacing one keyed attachment', () => {
    const writes = writesFor(() => {
      const gallery = new ImageGallery(theme);
      gallery.setImages([png('a'), png('b')]);
      gallery.render(80);
      gallery.setImages([png('a'), png('b'), png('c')]);
      gallery.render(80);
      gallery.setImages([png('a'), png('b', PNG_FIXTURES[1]), png('c')]);
      gallery.render(80);
    });
    expect(transmittedIds(writes)).toHaveLength(4); // initial a/b, append c, then only replaced b
    expect(deletedIds(writes)).toHaveLength(1);
  });

  it('retransmits owned images with stable IDs after same-width invalidation', () => {
    const writes = writesFor(() => {
      const gallery = new ImageGallery(theme);
      gallery.setImages([png('a')]);
      gallery.render(80);
      gallery.invalidate();
      gallery.render(80);
    });
    const ids = transmittedIds(writes);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(writes.filter((line) => line.includes('a=d,d=I'))).toEqual([]);
  });

  it('immediately releases exactly the removed ID and dispose releases only the survivor', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const gallery = new ImageGallery(theme);
      gallery.setImages([png('a'), png('b')]);
      gallery.render(80);
      const [a, b] = transmittedIds(write.mock.calls.map(([value]) => String(value)));
      write.mockClear();
      gallery.setImages([png('a')]);
      expect(deletedIds(write.mock.calls.map(([value]) => String(value)))).toEqual([b]);
      write.mockClear();
      gallery.dispose();
      expect(deletedIds(write.mock.calls.map(([value]) => String(value)))).toEqual([a]);
      write.mockClear();
      gallery.dispose();
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it('renders every attachment in the same fixed cell box', () => {
    const writes = writesFor(() => {
      const gallery = new ImageGallery(theme);
      gallery.setImages([png('a'), png('b'), png('c')]);
      const lines = gallery.render(200);
      // Header + blank spacer + one grid row (top border + 6 image rows
      // + label spacer + label row + bottom border).
      expect(lines).toHaveLength(1 + 1 + 10);
    });
    const transmissions = writes.filter((line) => line.includes('a=T'));
    expect(transmissions).toHaveLength(3);
    for (const line of transmissions) expect(line).toContain('c=16,r=6');
  });

  it('uses each marker number to color its complete frame and label independently', () => {
    const gallery = new ImageGallery(taggedTheme);
    gallery.setImages([png('[🖼️ #1]'), png('[🖼️ #2]')]);
    const lines = gallery.render(80);
    const frameTop = `╭${'─'.repeat(THUMB_COLUMNS)}╮`;
    const frameBottom = `╰${'─'.repeat(THUMB_COLUMNS)}╯`;

    expect(lines[2]).toBe(` <image-1>${frameTop}</image-1>  <image-2>${frameTop}</image-2>`);
    expect(lines[3]).toContain('<image-1>│</image-1>');
    expect(lines[3]).toContain('<image-2>│</image-2>');
    const label1 = `${' '.repeat(5)}🖼️ #1${' '.repeat(6)}`;
    const label2 = `${' '.repeat(5)}🖼️ #2${' '.repeat(6)}`;
    const spacerCell = `${' '.repeat(THUMB_COLUMNS)}`;
    expect(lines[9]).toBe(
      ` <image-1>│</image-1>${spacerCell}<image-1>│</image-1>` +
        `  <image-2>│</image-2>${spacerCell}<image-2>│</image-2>`,
    );
    expect(lines[10]).toBe(
      ` <image-1>│</image-1><image-1>${label1}</image-1><image-1>│</image-1>` +
        `  <image-2>│</image-2><image-2>${label2}</image-2><image-2>│</image-2>`,
    );
    expect(lines[11]).toBe(` <image-1>${frameBottom}</image-1>  <image-2>${frameBottom}</image-2>`);
  });

  it('uses the same per-marker colors in boxed and narrow text fallbacks', () => {
    capabilities.images = null;
    const boxed = new ImageGallery(taggedTheme);
    boxed.setImages([png('[🖼️ #1]'), png('[🖼️ #2]')]);
    const boxedLines = withoutImageProgramEnv(() => boxed.render(80));
    expect(boxedLines.join('\n')).toContain(`<image-1>╭${'─'.repeat(THUMB_COLUMNS)}╮</image-1>`);
    expect(boxedLines[3]).toBe(
      `<image-1>│</image-1><image-1>${' '.repeat(5)}🖼️ #1${' '.repeat(6)}</image-1><image-1>│</image-1>`,
    );
    expect(boxedLines[6]).toBe(
      `<image-2>│</image-2><image-2>${' '.repeat(5)}🖼️ #2${' '.repeat(6)}</image-2><image-2>│</image-2>`,
    );

    const narrow = new ImageGallery(taggedTheme);
    narrow.setImages([png('[🖼️ #1]')]);
    expect(withoutImageProgramEnv(() => narrow.render(12))).toContain('  <image-1>🖼️ #1</image-1>');
  });

  it('uses every cell that fits the terminal width without a per-row cap', () => {
    const writes = writesFor(() => {
      const gallery = new ImageGallery(theme);
      gallery.setImages(Array.from({ length: 5 }, (_, index) => png(`image-${index}`)));
      const lines = gallery.render(100);
      expect(lines).toHaveLength(1 + 1 + 10);
      expect(lines[2]!.match(/╭/g)).toHaveLength(5);
    });
    expect(transmittedIds(writes)).toHaveLength(5);
  });

  it('caps the width-driven grid at three rows with a +N more line', () => {
    const writes = writesFor(() => {
      const gallery = new ImageGallery(theme);
      gallery.setImages(Array.from({ length: 16 }, (_, index) => png(`image-${index}`)));
      const lines = gallery.render(100);
      expect(lines).toHaveLength(1 + 1 + 3 * 10 + 1);
      expect(lines.at(-1)).toContain('and 1 more image');
    });
    expect(transmittedIds(writes)).toHaveLength(16);
  });

  it('falls back to text and releases resources when the width cannot fit one uniform cell', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const gallery = new ImageGallery(theme);
      gallery.setImages([png('[🖼️ #1]')]);
      gallery.render(80);
      const [id] = transmittedIds(write.mock.calls.map(([value]) => String(value)));
      write.mockClear();
      expect(gallery.render(12)).toContain('  🖼️ #1');
      expect(deletedIds(write.mock.calls.map(([value]) => String(value)))).toEqual([id]);
    } finally {
      write.mockRestore();
    }
  });

  it('releases Kitty resources on protocol fallback and keeps unavailable mode textual', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const gallery = new ImageGallery(theme);
      gallery.setImages([png('[🖼️ #1]')]);
      gallery.render(80);
      const [id] = transmittedIds(write.mock.calls.map(([value]) => String(value)));
      write.mockClear();
      capabilities.images = null;
      gallery.invalidate();
      const lines = withoutImageProgramEnv(() => gallery.render(80));
      expect(lines.join('\n')).toContain('🖼️ #1');
      expect(deletedIds(write.mock.calls.map(([value]) => String(value)))).toEqual([id]);
      write.mockClear();
      const unavailable = new ImageGallery(theme);
      unavailable.setImages([png('[🖼️ #2]')]);
      expect(withoutImageProgramEnv(() => unavailable.render(80)).join('\n')).toContain('🖼️ #2');
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it('aligns the label row with the framed image rows by visible width', () => {
    const gallery = new ImageGallery(theme);
    gallery.setImages([png('[🖼️ #1]')]);
    const rendered = gallery.render(80);
    const labelRow = rendered.find((line) => line.includes('🖼️ #1'));
    const imageRow = rendered.find((line) => line.includes('\u{10EEEE}'));
    const topBorder = rendered.find((line) => line.includes('╭'));
    const bottomBorder = rendered.find((line) => line.includes('╰'));
    expect(topBorder).toBeDefined();
    expect(bottomBorder).toBeDefined();
    expect(labelRow).toBeDefined();
    expect(imageRow).toBeDefined();
    // The emoji label must be padded by visible width, or its border column
    // would drift inward relative to the image rows above it.
    const frameWidth = visibleWidth(topBorder!);
    expect(frameWidth).toBeGreaterThan(0);
    expect(visibleWidth(labelRow!)).toBe(frameWidth);
    expect(visibleWidth(imageRow!)).toBe(frameWidth);
    expect(visibleWidth(bottomBorder!)).toBe(frameWidth);
  });

  it('chunks large payloads and wraps Kitty APC sequences in tmux passthrough', () => {
    const previousTmux = process.env.TMUX;
    process.env.TMUX = 'test';
    try {
      const writes = writesFor(() => {
        const gallery = new ImageGallery(theme);
        gallery.setImages([png('large', 'x'.repeat(4097))]);
        gallery.render(80);
      });
      expect(writes).toHaveLength(2);
      expect(writes[0]).toContain('a=T,U=1,f=100');
      expect(writes[0]).toContain('m=1');
      expect(writes[1]).toContain('m=0;x');
      expect(writes.every((line) => line.startsWith('\x1bPtmux;') && line.includes('\x1b\x1b_G'))).toBe(true);
    } finally {
      if (previousTmux === undefined) delete process.env.TMUX;
      else process.env.TMUX = previousTmux;
    }
  });

  it('measures the same 5/10/20 fixtures against full rebuild and incremental strategies', () => {
    for (const count of [5, 10, 20]) {
      const snapshots = staggeredSnapshots(count);
      const baseline = measureFullRebuildBaseline(snapshots);
      const optimized = measureIncremental(snapshots);
      expect(baseline.galleryCreations).toBe(snapshots.length);
      expect(baseline.renders).toBe(snapshots.length);
      expect(baseline.updateRequests).toBe(snapshots.length);
      expect(baseline.pngPayloadBytes).toBeGreaterThan(0);
      expect(baseline.controlBytes).toBeGreaterThan(0);
      expect(baseline.deletes).toBeGreaterThan(0);
      expect(baseline.liveIds).toBe(0);
      expect(optimized.galleryCreations).toBe(1);
      expect(optimized.renders).toBe(snapshots.length);
      expect(optimized.updateRequests).toBe(snapshots.length);
      expect(optimized.pngPayloadBytes).toBeLessThan(baseline.pngPayloadBytes);
      expect(optimized.controlBytes).toBeLessThan(baseline.controlBytes);
      expect(optimized.deletes).toBeLessThan(baseline.deletes);
      expect(optimized.liveIds).toBe(0);
    }
    const snapshots = staggeredSnapshots(20);
    const baseline = measureFullRebuildBaseline(snapshots);
    const optimized = measureIncremental(snapshots);
    expect(optimized.galleryCreations).toBeLessThanOrEqual(baseline.galleryCreations * 0.2);
    expect(optimized.pngPayloadBytes).toBeLessThanOrEqual(baseline.pngPayloadBytes * 0.2);
    const initialPayloadBytes = snapshots[0]!.reduce((total, item) => total + item.data.length, 0);
    const changedPayloadBytes = Array.from(
      { length: 20 },
      (_, index) => PNG_FIXTURES[(index + 1) % PNG_FIXTURES.length].length,
    ).reduce((total, bytes) => total + bytes, 0);
    expect(optimized.pngPayloadBytes - initialPayloadBytes).toBe(changedPayloadBytes);
  });

  it('keeps strategy payload accounting nonzero under an ambient tmux environment', () => {
    const previousTmux = process.env.TMUX;
    process.env.TMUX = 'ambient-test';
    try {
      const metrics = measureIncremental(staggeredSnapshots(5));
      expect(metrics.pngPayloadBytes).toBeGreaterThan(0);
      expect(metrics.controlBytes).toBeGreaterThan(0);
    } finally {
      if (previousTmux === undefined) delete process.env.TMUX;
      else process.env.TMUX = previousTmux;
    }
  });
});
