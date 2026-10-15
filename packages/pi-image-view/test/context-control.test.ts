import { describe, expect, it, vi } from 'vitest';

vi.mock('@earendil-works/pi-tui', () => ({
  getCapabilities: () => ({ images: null }),
  getImageDimensions: () => null,
  calculateImageRows: () => 0,
  getCellDimensions: () => ({ width: 0, height: 0 }),
}));

import { sanitizeModelMessages } from '../extensions/image-view/attachment-links.ts';
import { registerImagePreviewExtension } from '../extensions/image-view/extension-runtime.ts';

const image = (data: string) => ({ type: 'image', data, mimeType: 'image/png' });

function contextHarness() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const commands = new Map<string, { handler: (args: string, ctx: any) => void }>();
  const notify = vi.fn();
  registerImagePreviewExtension(
    {
      on: (event: string, handler: (...args: any[]) => any) => handlers.set(event, handler),
      registerCommand: (name: string, options: { handler: (args: string, ctx: any) => void }) =>
        commands.set(name, options),
    } as any,
    {
      loadImage: vi.fn(async () => null),
    },
  );
  const ctx = {
    cwd: '/tmp',
    hasUI: false,
    ui: { notify, setWidget: vi.fn(), getEditorText: vi.fn(() => ''), setEditorText: vi.fn(), theme: {} },
  };
  return { handlers, command: commands.get('pi-image-view')!, ctx, notify };
}

describe('model image context clearing', () => {
  it('removes only images before the clear boundary without mutating input', () => {
    const messages = [
      { role: 'user', content: [image('OLD')] },
      { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
      { role: 'user', content: [{ type: 'text', text: 'new' }, image('NEW')] },
    ];
    const snapshot = structuredClone(messages);
    expect(sanitizeModelMessages(messages, 2)).toEqual([
      { role: 'user', content: [{ type: 'text', text: '[Image omitted from model context]' }] },
      messages[1],
      messages[2],
    ]);
    expect(messages).toEqual(snapshot);
  });

  it('clear drops existing images but preserves images attached afterward', () => {
    const { handlers, command, ctx, notify } = contextHarness();
    const oldContext = [
      { role: 'user', content: [image('OLD')] },
      { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    ];
    handlers.get('context')!({ messages: oldContext });
    command.handler('clear', ctx);
    const nextContext = [...oldContext, { role: 'user', content: [{ type: 'text', text: 'new' }, image('NEW')] }];
    const result = handlers.get('context')!({ messages: nextContext }).messages;

    expect(notify).toHaveBeenLastCalledWith('Existing images cleared from model context', 'info');
    expect(result[0].content).toEqual([{ type: 'text', text: '[Image omitted from model context]' }]);
    expect(result[2].content).toEqual([{ type: 'text', text: 'new' }, image('NEW')]);
  });

  it('clear before the first context keeps the next user turn', () => {
    const { handlers, command, ctx } = contextHarness();
    command.handler('clear', ctx);
    const result = handlers.get('context')!({
      messages: [
        { role: 'user', content: [image('OLD')] },
        { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
        { role: 'user', content: [{ type: 'text', text: 'current' }, image('CURRENT')] },
      ],
    }).messages;
    expect(result[0].content).toEqual([{ type: 'text', text: '[Image omitted from model context]' }]);
    expect(result[2].content).toEqual([{ type: 'text', text: 'current' }, image('CURRENT')]);
  });

  it('validates commands and resets the boundary on session start', async () => {
    const { handlers, command, ctx, notify } = contextHarness();
    const old = [{ role: 'user', content: [image('OLD')] }];
    handlers.get('context')!({ messages: old });
    command.handler('', ctx);
    command.handler('all', ctx);
    command.handler('detail', ctx);
    command.handler('clear', ctx);
    expect(notify.mock.calls.slice(0, 2)).toEqual([
      ['Usage: /pi-image-view [clear|detail]', 'error'],
      ['Usage: /pi-image-view [clear|detail]', 'error'],
    ]);
    expect(notify.mock.calls[2]).toEqual(['Next image submission will use 1280px detail mode', 'info']);
    expect(handlers.get('context')!({ messages: old }).messages[0].content).toEqual([
      { type: 'text', text: '[Image omitted from model context]' },
    ]);
    await handlers.get('session_start')!(undefined, ctx);
    expect(handlers.get('context')!({ messages: old }).messages[0].content).toEqual([image('OLD')]);
  });

  it('rebases the clear boundary when compaction removes a context prefix', () => {
    const { handlers, command, ctx } = contextHarness();
    const beforeClear = [
      { role: 'user', content: [image('VERY_OLD')] },
      { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
      { role: 'user', content: [image('OLD')] },
    ];
    handlers.get('context')!({ messages: beforeClear });
    command.handler('clear', ctx);
    const afterClear = [...beforeClear, { role: 'user', content: [image('NEW')] }];
    handlers.get('context')!({ messages: afterClear });

    const compacted = [
      { role: 'user', content: [image('OLD')] },
      { role: 'user', content: [image('NEW')] },
    ];
    const result = handlers.get('context')!({ messages: compacted }).messages;

    expect(result[0].content).toEqual([{ type: 'text', text: '[Image omitted from model context]' }]);
    expect(result[1].content).toEqual([image('NEW')]);
  });
});
