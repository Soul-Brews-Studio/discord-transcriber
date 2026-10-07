import { test, expect } from 'bun:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import OpusScript from 'opusscript';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { DiscordAdapter } from '../src/discord.ts';
import type {
  ClientLike, JoinVoiceOptions, OpusScriptConstructor, VoiceConnectionLike, VoiceLib
} from '../src/discord/types.ts';
import type { ReceiveOptions, TranscriptRow, VoiceChannel } from '../src/types.ts';
import { fake } from './support/fake.ts';

/** A voice channel the fake guild will resolve; only id and guildId are read. */
const room = (): VoiceChannel => fake<VoiceChannel>({ guildId: 'guild', id: 'room' });

const owner = '100000000000000001';
const DefaultDecoder = class {
  static Application = { AUDIO: 2049 };
  decode(packet: Buffer): Buffer {
    if (packet.toString() === 'bad') throw new Error('invalid');
    return packet;
  }
  delete(): void {}
};

/**
 * A Discord voice session built from streams and emitters.
 *
 * Every double here implements only what the receive path reaches for, so each
 * is widened once through `fake` at the boundary rather than being loosely
 * typed throughout.
 */
function fixture(Decoder: unknown = DefaultDecoder) {
  const adapter = new DiscordAdapter();
  const streams = new Map<string, PassThrough>();
  const rows: TranscriptRow[] = [];
  const joins: JoinVoiceOptions[] = [];

  const speaking = Object.assign(new EventEmitter(), { users: new Map<string, unknown>() });
  const emitter = new EventEmitter();
  const conn = fake<VoiceConnectionLike>(Object.assign(emitter, {
    state: { status: 'ready' },
    joinConfig: { guildId: 'guild', selfDeaf: false },
    receiver: {
      speaking,
      subscribe(userId: string) {
        const stream = new PassThrough();
        streams.set(userId, stream);
        return stream;
      }
    },
    destroy: () => { conn.state = { status: 'destroyed' }; }
  }));

  const voice = { selfDeaf: false, selfMute: true, serverDeaf: false };
  const target = {
    id: 'room', type: ChannelType.GuildVoice,
    permissionsFor: () => ({ has: (flags: readonly bigint[]) => flags.includes(PermissionFlagsBits.Connect) })
  };
  const guild = {
    id: 'guild', name: 'Test', voiceAdapterCreator() {},
    channels: { fetch: async () => target, cache: new Map() },
    members: { fetchMe: async () => ({ id: 'bot' }) },
    voiceStates: { cache: new Map([['bot', voice]]) }
  };
  adapter.client = fake<ClientLike>({
    isReady: () => true, user: { id: 'bot', tag: 'Bot#1', bot: true },
    guilds: { fetch: async () => guild, cache: new Map([['guild', guild]]) },
    users: { cache: new Map([[owner, { displayName: 'Owner' }], ['other', { displayName: 'Other' }]]) }
  });
  adapter.lib = fake<VoiceLib>({
    EndBehaviorType: { AfterSilence: 1 },
    VoiceConnectionStatus: { Ready: 'ready', Disconnected: 'disconnected', Destroyed: 'destroyed' },
    joinVoiceChannel(options: JoinVoiceOptions) {
      joins.push(options);
      conn.joinConfig = options;
      return conn;
    },
    entersState: async () => {}
  });

  const start = (options: Partial<ReceiveOptions> = {}): void => {
    adapter.audio.enabled = true;
    adapter.startReceiving(conn,
      { listenUserId: owner, onRow: (row: TranscriptRow) => rows.push(row), ...options },
      fake<OpusScriptConstructor>(Decoder));
  };
  return { adapter, conn, streams, rows, joins, voice, start, speak: (id: string) => speaking.emit('start', id) };
}

test('listen join undeafens without MLX; join-only keeps deafened', async () => {
  const f = fixture();
  await f.adapter.join(room(), { listen: true, onRow() {}, onDisconnect() {} });
  expect(f.joins[0]!.selfDeaf).toBe(false); expect(f.joins[0]!.selfMute).toBe(true);
  expect((f.conn.receiver.speaking as unknown as EventEmitter).listenerCount('start')).toBe(1);
  expect(f.adapter.audioState().selfDeaf).toBe(false);
  f.voice.serverDeaf = true; expect(f.adapter.audioState().serverDeaf).toBe(true);
  f.adapter.leave();
  await f.adapter.join(room(), { onRow() {}, onDisconnect() {} });
  expect(f.joins[1]!.selfDeaf).toBe(true); expect((f.conn.receiver.speaking as unknown as EventEmitter).listenerCount('start')).toBe(0);
  f.adapter.leave();
});
test('listen-only decodes authorized speaker and measures PCM, without STT or rows', () => {
  const f = fixture(); let drains = 0; f.adapter.drain = async () => { drains++; }; f.start();
  f.speak('other'); expect(f.streams.size).toBe(0);
  f.speak(owner); const pcm = Buffer.alloc(3840); for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(8192, i);
  f.streams.get(owner)!.write(pcm);
  const audio = f.adapter.audioState();
  expect(audio.packets).toBe(1); expect(audio.decodedBytes).toBe(3840);
  expect(audio.audioSeconds).toBeCloseTo(0.02); expect(audio.rms).toBeCloseTo(0.25); expect(audio.peak).toBeCloseTo(0.25);
  expect(audio.speaker).toBe('Owner'); expect(audio.lastAudioAt).not.toBeNull();
  f.streams.get(owner)!.emit('end'); expect(f.adapter.captures.size).toBe(0);
  expect(drains).toBe(0); expect(f.adapter.queue).toEqual([]); expect(f.rows).toEqual([]); f.adapter.leave();
});
test('receiver recovers on next utterance after invalid Opus; leave removes subscriptions', () => {
  const f = fixture(); f.start(); f.speak(owner); f.streams.get(owner)!.write(Buffer.from('bad'));
  expect(f.adapter.audio.decodeErrors).toBe(1); expect(f.adapter.captures.size).toBe(0);
  f.speak(owner); f.streams.get(owner)!.write(Buffer.alloc(3840)); expect(f.adapter.audio.decodedBytes).toBe(3840);
  f.adapter.leave(); const before = f.adapter.audio.packets;
  f.speak(owner); expect(f.adapter.captures.size).toBe(0); expect((f.conn.receiver.speaking as unknown as EventEmitter).listenerCount('start')).toBe(0);
  expect(f.adapter.audio.packets).toBe(before); expect(f.adapter.audio.enabled).toBe(false);
});
test('transcription still buffers WAV on end when explicitly enabled', async () => {
  const f = fixture(); f.adapter.drain = async () => {}; f.start({ transcribe: true, sttURL: 'http://127.0.0.1:4655' });
  f.speak(owner); const pcm = Buffer.alloc(96000); for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(8192, i);
  f.streams.get(owner)!.write(pcm); f.streams.get(owner)!.emit('end');
  // The speech gate is consulted before anything reaches the queue, so the push
  // lands on the vadWork chain rather than synchronously inside emit('end').
  await f.adapter.vadWork;
  expect(f.adapter.queue.length).toBe(1); expect(f.adapter.queue[0]!.wav.subarray(44)).toEqual(pcm);
  f.adapter.leave();
});

test('the energy gate stands in when no sidecar is running', async () => {
  const f = fixture(); f.adapter.drain = async () => {}; f.start({ transcribe: true, sttURL: 'http://127.0.0.1:4655' });
  expect(f.adapter.vad).toBeNull();
  f.speak(owner);
  // Loud enough and long enough for the energy gate: 0.5 s at half scale.
  const pcm = Buffer.alloc(48000 * 4 / 2); for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(16384, i);
  f.streams.get(owner)!.write(pcm); f.streams.get(owner)!.emit('end');
  await f.adapter.vadWork;
  expect(f.adapter.queue.length).toBe(1);
  f.adapter.leave();
});

test('Silero overrules the energy gate — loud non-speech never reaches the queue', async () => {
  const f = fixture(); f.adapter.drain = async () => {};
  // A sidecar that is certain this is not speech, on audio the energy gate likes.
  f.adapter.vad = { backend: 'fake', predict: async () => 0.01, reset: async () => {}, stop: () => {} };
  f.start({ transcribe: true, sttURL: 'http://127.0.0.1:4655' });
  f.speak(owner);
  const pcm = Buffer.alloc(96000); for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(16384, i);
  f.streams.get(owner)!.write(pcm); f.streams.get(owner)!.emit('end');
  await f.adapter.vadWork;
  expect(f.adapter.queue.length).toBe(0);
  f.adapter.leave();
});
test('real Opus encode/decode yields measured audio without a model or network', () => {
  const f = fixture(OpusScript); const encoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
  const pcm = Buffer.alloc(3840);
  for (let i = 0; i < 960; i++) {
    const sample = Math.round(Math.sin(2 * Math.PI * 440 * i / 48000) * 8192);
    pcm.writeInt16LE(sample, i * 4); pcm.writeInt16LE(sample, i * 4 + 2);
  }
  f.start(); f.speak(owner);
  for (let i = 0; i < 5; i++) f.streams.get(owner)!.write(encoder.encode(pcm, 960));
  expect(f.adapter.audio.packets).toBe(5); expect(f.adapter.audio.decodedBytes).toBe(5 * pcm.length);
  expect(f.adapter.audio.rms).toBeGreaterThan(0.05); expect(f.adapter.audio.decodeErrors).toBe(0);
  f.adapter.leave(); encoder.delete();
});
