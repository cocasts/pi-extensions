import fsp from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadImage } from '../extensions/image-view/image-content.ts';

vi.mock('node:fs/promises', () => ({
  default: {
    stat: vi.fn(),
    readFile: vi.fn(),
  },
}));

const stat = vi.mocked(fsp.stat);
const readFile = vi.mocked(fsp.readFile);

describe('async image loading', () => {
  beforeEach(() => {
    stat.mockReset();
    readFile.mockReset();
  });

  it('stats a supported image once before reading it', async () => {
    stat.mockResolvedValue({ isFile: () => true, size: 3 } as Awaited<ReturnType<typeof fsp.stat>>);
    readFile.mockResolvedValue(Buffer.from('png'));

    await expect(loadImage('/tmp/example.png')).resolves.toEqual({
      type: 'image',
      data: Buffer.from('png').toString('base64'),
      mimeType: 'image/png',
    });
    expect(stat).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith('/tmp/example.png');
  });

  it('skips unsupported extensions without touching the filesystem', async () => {
    await expect(loadImage('/tmp/example.txt')).resolves.toBeNull();
    expect(stat).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('skips directories and oversized files', async () => {
    stat.mockResolvedValueOnce({ isFile: () => false, size: 0 } as Awaited<ReturnType<typeof fsp.stat>>);
    await expect(loadImage('/tmp/folder.png')).resolves.toBeNull();

    stat.mockResolvedValueOnce({
      isFile: () => true,
      size: 50 * 1024 * 1024 + 1,
    } as Awaited<ReturnType<typeof fsp.stat>>);
    await expect(loadImage('/tmp/large.png')).resolves.toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('returns null when stat or read fails', async () => {
    stat.mockRejectedValueOnce(new Error('missing'));
    await expect(loadImage('/tmp/missing.png')).resolves.toBeNull();

    stat.mockResolvedValueOnce({ isFile: () => true, size: 3 } as Awaited<ReturnType<typeof fsp.stat>>);
    readFile.mockRejectedValueOnce(new Error('unreadable'));
    await expect(loadImage('/tmp/unreadable.png')).resolves.toBeNull();
  });
});
