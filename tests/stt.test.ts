import { test, expect } from 'bun:test';
import { DiscordAdapter } from '../src/discord.ts';
import type { RowBody } from '../src/types.ts';
import type { AdapterState } from '../src/discord/types.ts';
import { drain } from '../src/discord/drain.ts';
import { fake } from './support/fake.ts';


test('MLX adapter posts WAV and consumes recovered text response', async () => {
  const original = globalThis.fetch;
  const adapter = new DiscordAdapter(); const rows: RowBody[] = []; const wav = Buffer.from('RIFF-test');
  globalThis.fetch = fake<typeof fetch>(async (url: string, options: RequestInit) => {
    expect(url).toBe('http://127.0.0.1:4655/transcribe');
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('audio/wav');
    expect(options.body).toBe(wav);
    return Response.json({ text: 'สวัสดีครับ', inference: 0.2 });
  });
  try {
    adapter.queue.push({ wav, generation: 0, sttURL: 'http://127.0.0.1:4655', row: (value: RowBody) => rows.push(value) });
    await adapter.drain(); expect(rows).toEqual([{ status: 'final', text: 'สวัสดีครับ' }]);
  } finally { globalThis.fetch = original; }
});
test('leave cancels STT and discards pending output', async () => {
  const original = globalThis.fetch; const adapter = new DiscordAdapter(); const rows: RowBody[] = [];
  globalThis.fetch = fake<typeof fetch>((_url: string, options: RequestInit) =>
    new Promise<Response>((_resolve, reject) =>
      options.signal?.addEventListener('abort', () => reject(new Error('cancelled')))));
  try {
    adapter.queue.push({ wav: Buffer.from('data'), generation: 0, sttURL: 'http://127.0.0.1:4655', row: (value: RowBody) => rows.push(value) });
    const pending = adapter.drain(); adapter.leave(); await pending;
    expect(rows).toEqual([]); expect(adapter.queue).toEqual([]);
  } finally { globalThis.fetch = original; }
});
test('MLX failures are reported without response body leakage', async () => {
  const original = globalThis.fetch; const adapter = new DiscordAdapter(); const rows: RowBody[] = [];
  globalThis.fetch = fake<typeof fetch>(async () => new Response('private backend error', { status: 500 }));
  try {
    adapter.queue.push({ wav: Buffer.from('data'), generation: 0, sttURL: 'http://127.0.0.1:4655', row: (value: RowBody) => rows.push(value) });
    await adapter.drain(); expect(rows[0]!.status).toBe('error'); expect(JSON.stringify(rows)).not.toContain('private');
  } finally { globalThis.fetch = original; }
});

test('an empty transcription is a success, not a row', async () => {
  const rows: RowBody[] = [];
  const adapter = fake<AdapterState>({
    generation: 1, activeRequest: null, drain: async () => {},
    queue: [{ wav: new Uint8Array([1]), generation: 1, sttURL: 'http://127.0.0.1:4655',
              row: (body: RowBody) => { rows.push(body); } }]
  });
  const original = globalThis.fetch;
  // The service heard no words. That is a correct answer, and it must not
  // become a transcript row carrying a speaker, a time and nothing said.
  globalThis.fetch = fake<typeof fetch>(async () => new Response(JSON.stringify({ text: '   ' }), { status: 200 }));
  try { await drain(adapter); } finally { globalThis.fetch = original; }
  expect(rows).toEqual([]);
});

test('a transcription with words still becomes exactly one row', async () => {
  const rows: RowBody[] = [];
  const adapter = fake<AdapterState>({
    generation: 1, activeRequest: null, drain: async () => {},
    queue: [{ wav: new Uint8Array([1]), generation: 1, sttURL: 'http://127.0.0.1:4655',
              row: (body: RowBody) => { rows.push(body); } }]
  });
  const original = globalThis.fetch;
  globalThis.fetch = fake<typeof fetch>(async () => new Response(JSON.stringify({ text: '  สวัสดีครับ  ' }), { status: 200 }));
  try { await drain(adapter); } finally { globalThis.fetch = original; }
  expect(rows).toEqual([{ status: 'final', text: 'สวัสดีครับ' }]);
});
