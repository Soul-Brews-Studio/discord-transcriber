import { test, expect } from 'bun:test';
import { Controller } from '../src/controller.ts';
import { pcmToWav } from '../src/audio/pcmToWav.ts';
import { audible } from '../src/audio/audible.ts';
import { handler, localSTT } from '../src/server.ts';
import type {
  AdapterJoinOptions, ConnectResult, ControllerOptions, JoinOptions, OnFailure, OnLocation,
  PublicState, TranscriptRow, VoiceChannel
} from '../src/types.ts';
import type { CallRecord, RecordingAdapter } from './support/types.ts';
import { fake } from './support/fake.ts';

/** A row carrying only the text a test asserts on; the rest is never read. */
const row = (text: string): TranscriptRow => fake<TranscriptRow>({ text });

const channel: VoiceChannel = { id: '123', guildId: '456', name: 'Selected', guildName: 'Test' };

function fixture(options: ControllerOptions = {}) {
  const calls: CallRecord[] = [];
  const adapter: RecordingAdapter = {
    async connect(_token: string, onFailure: OnFailure): Promise<ConnectResult> {
      calls.push('connect');
      adapter.onFailure = onFailure;
      return { bot: { id: '7', name: 'Test Bot', isBot: true }, channels: [channel] };
    },
    async join(target: VoiceChannel, joinOptions: AdapterJoinOptions): Promise<void> {
      calls.push(['join', target]);
      adapter.options = joinOptions;
    },
    leave(): void { calls.push('leave'); },
    disconnect(): void { calls.push('disconnect'); }
  };
  return { adapter, calls, controller: new Controller(adapter, { token: 'test-token-not-real', ...options }) };
}
test('startup is offline; connect loads channels but never joins or exposes token', async () => {
  const { controller, calls } = fixture();
  expect(controller.phase).toBe('offline'); expect(calls).toEqual([]);
  await controller.connect(); expect(controller.phase).toBe('ready'); expect(calls).toEqual(['connect']);
  expect(JSON.stringify(controller.state())).not.toContain('test-token-not-real');
});
test('missing config prevents login', async () => {
  const { controller, calls } = fixture({ token: '' });
  await expect(controller.connect()).rejects.toThrow('DISCORD_BOT_TOKEN'); expect(calls).toEqual([]);
});
test('proper bot required and SDK errors sanitized', async () => {
  const { controller, adapter } = fixture();
  adapter.connect = async () => fake<ConnectResult>({ bot: { isBot: false } });
  await expect(controller.connect()).rejects.toThrow('Bot connection failed'); expect(controller.phase).toBe('offline');
  adapter.connect = async () => { throw new Error('secret-token'); };
  await expect(controller.connect()).rejects.not.toThrow('secret-token');
});
test('unknown target and missing transcription consent cannot join', async () => {
  const { controller, calls } = fixture({ sttURL: 'http://127.0.0.1:4655' });
  await controller.connect();
  await expect(controller.join({ guildId: 'wrong', channelId: '123' })).rejects.toThrow('Select');
  await expect(controller.join({ guildId: '456', channelId: '123', transcribe: true })).rejects.toThrow('consent');
  expect(calls).toEqual(['connect']);
});
test('join-only is explicit and late transcript callbacks ignored after leave', async () => {
  const { controller, adapter } = fixture();
  await controller.connect(); await controller.join({ guildId: '456', channelId: '123' });
  expect(controller.phase).toBe('joined'); expect(adapter.options!.transcribe).toBe(false);
  controller.leave(); adapter.options!.onRow(row('late')); expect(controller.rows).toEqual([]);
});
test('transcription is bounded; gateway failure still handled after join', async () => {
  const { controller, adapter } = fixture({ sttURL: 'http://127.0.0.1:4655' });
  await controller.connect(); await controller.join({ guildId: '456', channelId: '123', transcribe: true, consent: true });
  for (let i = 0; i < 110; i++) adapter.options!.onRow(row(String(i)));
  expect(controller.rows.length).toBe(100); expect(controller.rows[0]!.text).toBe('10');
  adapter.onFailure!('Gateway unavailable'); expect(controller.phase).toBe('offline'); expect(controller.error).toBe('Gateway unavailable');
});
test('failed join cleans up; no false success', async () => {
  const { controller, adapter, calls } = fixture();
  await controller.connect(); adapter.join = async () => { throw new Error('UDP failed'); };
  await expect(controller.join({ guildId: '456', channelId: '123' })).rejects.toThrow('Voice join failed');
  expect(controller.phase).toBe('ready'); expect(controller.channel).toBe(null); expect(calls).toContain('leave');
});
test('disconnect cancels pending login; leave cancels pending join', async () => {
  const { controller, adapter } = fixture();
  // One slot reused for both a login and a join, so it is typed as the loosest of the two.
  let resolve: (value: never) => void = () => {};
  adapter.connect = () => new Promise<ConnectResult>(r => { resolve = r as (value: never) => void; });
  const login = controller.connect(); controller.disconnect();
  resolve(fake<never>({ bot: { isBot: true }, channels: [channel] })); await login;
  expect(controller.phase).toBe('offline');
  adapter.connect = async () => fake<ConnectResult>({ bot: { isBot: true }, channels: [channel] });
  await controller.connect(); adapter.join = () => new Promise<void>(r => { resolve = r as (value: never) => void; });
  const join = controller.join({ guildId: '456', channelId: '123' }); controller.leave(); resolve(fake<never>(undefined)); await join;
  expect(controller.phase).toBe('ready'); expect(controller.channel).toBe(null);
});
test('voice interruption transitions to ready and invalidates late rows', async () => {
  const { controller, adapter } = fixture(); await controller.connect();
  await controller.join({ guildId: '456', channelId: '123' });
  adapter.options!.onDisconnect(); adapter.options!.onRow(row('stale'));
  expect(controller.phase).toBe('ready'); expect(controller.rows).toEqual([]);
});
test('WAV matches recovered 48k stereo PCM endpoint and silence is dropped', () => {
  const pcm = Buffer.alloc(96000); const wav = pcmToWav(pcm);
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF'); expect(wav.readUInt32LE(24)).toBe(48000);
  expect(wav.readUInt16LE(22)).toBe(2); expect(wav.readUInt32LE(40)).toBe(pcm.length);
  expect(audible(pcm)).toBe(false);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(1000, i);
  expect(audible(pcm)).toBe(true); expect(audible(pcm.subarray(0, 100))).toBe(false);
});
test('STT endpoint cannot silently export audio remotely', () => {
  expect(localSTT('http://127.0.0.1:4655')).toBe('http://127.0.0.1:4655');
  for (const value of ['https://example.com', 'http://localhost@evil.com', 'http://localhost/path']) expect(() => localSTT(value)).toThrow();
});
test('local HTTP boundary rejects foreign Host, Origin and missing control token', async () => {
  const { controller } = fixture(); const fetch = handler(controller, { port: 4666, controlToken: 'test-control', origins: new Set(['http://127.0.0.1:4666']) });
  const req = (path: string, extra: RequestInit = {}): Request =>
    new Request('http://127.0.0.1:4666' + path,
      { ...extra, headers: { host: '127.0.0.1:4666', 'x-control-token': 'test-control', ...extra.headers as Record<string, string> } });
  expect((await fetch(req('/api/state'))).status).toBe(200);
  expect((await fetch(req('/api/state', { headers: { 'x-control-token': '' } }))).status).toBe(403);
  expect((await fetch(req('/api/connect', { method: 'POST', headers: { origin: 'http://evil.example' } }))).status).toBe(403);
  expect((await fetch(req('/api/state', { headers: { host: 'evil.example' } }))).status).toBe(403);
  expect((await fetch(req('/api/join', { method: 'POST', body: '{' }))).status).toBe(400);
  expect((await fetch(req('/api/join', { method: 'POST', body: 'x'.repeat(2049) }))).status).toBe(413);
  expect((await fetch(req('/../../.env'))).status).toBe(404);
});

test('listen-only is independent of MLX and explicitly consent-gated', async () => {
  const { controller, adapter } = fixture(); await controller.connect();
  await expect(controller.join({ guildId: '456', channelId: '123', listen: true })).rejects.toThrow('consent');
  await controller.join({ guildId: '456', channelId: '123', listen: true, consent: true });
  expect(adapter.options!.listen).toBe(true); expect(adapter.options!.transcribe).toBe(false);
  expect(controller.state().channel?.listen).toBe(true); expect(controller.state().transcriptionConfigured).toBe(false);
});
test('listen option validation happens before voice mutation', async () => {
  const { controller, calls } = fixture(); await controller.connect();
  await expect(controller.join(fake<JoinOptions>({ guildId: '456', channelId: '123', listen: 'false', consent: true }))).rejects.toThrow('Invalid');
  await expect(controller.join(fake<JoinOptions>({ guildId: '456', channelId: '123', listen: true, listenUserId: 123, consent: true }))).rejects.toThrow('Invalid');
  expect(calls).toEqual(['connect']);
});

test('follow HTTP accepts listening options and enforces consent and body limits', async () => {
  const { controller, adapter } = fixture(); await controller.connect();
  adapter.watchUser = (_userId: string, changed: OnLocation) => { changed(null); return () => {}; };
  const fetch = handler(controller, { port: 4666, controlToken: 'test-control', origins: new Set(['http://127.0.0.1:4666']) });
  const req = (body: string): Request => new Request('http://127.0.0.1:4666/api/follow-me', {
    method: 'POST', body, headers: { host: '127.0.0.1:4666', 'x-control-token': 'test-control' } });
  expect((await fetch(req('{"listen":true}'))).status).toBe(400);
  expect((await fetch(req('null'))).status).toBe(400);
  expect((await fetch(req('[]'))).status).toBe(400);
  expect((await fetch(req('x'.repeat(2049)))).status).toBe(413);
  const response = await fetch(req('{"listen":true,"consent":true}'));
  expect(response.status).toBe(200); expect((await response.json() as PublicState).following?.listen).toBe(true);
  controller.disconnect();
});

test('a named STT host is allowed only when named, and only as itself', () => {
  // The container deployment reaches a sibling service; loopback there is the
  // container. One host, never a wildcard — widening this deletes the rule
  // rather than moving it.
  expect(localSTT('http://core-whisper:10300', 'core-whisper')).toBe('http://core-whisper:10300');
  expect(localSTT('http://127.0.0.1:4655', 'core-whisper')).toBe('http://127.0.0.1:4655');
  expect(() => localSTT('http://core-whisper:10300')).toThrow();
  for (const bad of ['http://evil.example', 'https://core-whisper:10300',
                     'http://core-whisper:10300/path', 'http://u:p@core-whisper:10300']) {
    expect(() => localSTT(bad, 'core-whisper')).toThrow();
  }
});
