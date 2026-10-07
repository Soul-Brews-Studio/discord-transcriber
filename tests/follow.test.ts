import { test, expect } from 'bun:test';
import { Controller } from '../src/controller.ts';
import { DiscordAdapter } from '../src/discord.ts';
import { EventEmitter } from 'node:events';
import type {
  AdapterJoinOptions, ConnectResult, OnLocation, VoiceChannel, VoiceLocation
} from '../src/types.ts';
import type { ClientLike } from '../src/discord/types.ts';
import type { FollowAdapter } from './support/types.ts';
import { fake } from './support/fake.ts';
import { autoFollowMode } from '../src/controller/autoFollowMode.ts';

const guildId = '200000000000000002';

function setup() {
  const calls: string[] = [];
  let callback: OnLocation | undefined;
  let unwatched = false;
  const adapter: FollowAdapter = {
    watchUser(user: string, cb: OnLocation): () => void {
      expect(user).toBe('100000000000000001');
      callback = cb;
      cb({ guildId, channelId: 'a' });
      return () => { unwatched = true; };
    },
    async join(channel: VoiceChannel, options: AdapterJoinOptions): Promise<void> {
      calls.push(channel.id);
      expect(options.transcribe).toBe(false);
    },
    async connect(): Promise<ConnectResult> {
      return { bot: { id: '7', name: 'Test Bot', isBot: true },
               channels: ['a', 'b', 'c'].map(id => ({ id, guildId, name: id, guildName: 'the home server' })) };
    },
    leave(): void {},
    disconnect(): void {}
  };
  const c = new Controller(adapter);
  c.phase = 'ready';
  c.channels = ['a', 'b', 'c'].map(id => ({ id, guildId, name: id, guildName: 'the home server' }));
  c.channels.push({ id: 'z', guildId: 'other-guild', name: 'general', guildName: 'Makers' });
  return {
    c, adapter, calls,
    change: (id: string | null, guild: string = guildId): void =>
      callback?.(id ? { guildId: guild, channelId: id } : null),
    unwatched: (): boolean => unwatched
  };
}
test('follow joins current room, moves, leaves on disconnect, rejoins on return', async () => {
  const f = setup(); await f.c.startFollow(); expect(f.calls).toEqual(['a']);
  f.change('b'); await f.c.followWork; expect(f.c.channel?.id).toBe('b');
  f.change(null); await f.c.followWork; expect(f.c.phase).toBe('ready'); expect(f.c.follow).not.toBeNull();
  f.change('c'); await f.c.followWork; expect(f.c.channel?.id).toBe('c');
});
test('manual leave disables follow and ignores stale callbacks', async () => {
  const f = setup(); await f.c.startFollow(); f.c.leave();
  f.change('b'); await f.c.followWork;
  expect(f.unwatched()).toBe(true); expect(f.c.follow).toBeNull(); expect(f.calls).toEqual(['a']);
});
test('rapid moves coalesce to latest target', async () => {
  const f = setup(); await f.c.startFollow(); f.change('b'); f.change('c');
  await f.c.followWork; expect(f.calls).toEqual(['a', 'c']);
});
test('unknown channel fails safely without losing follow intent', async () => {
  const f = setup(); await f.c.startFollow(); f.change('unknown'); await f.c.followWork;
  expect(f.c.phase).toBe('ready'); expect(f.c.error).toContain('Cannot follow');
  f.change('b'); await f.c.followWork; expect(f.c.channel?.id).toBe('b');
});
test('disconnect invalidates pending moves', async () => {
  const f = setup(); await f.c.startFollow(); f.change('b'); f.c.disconnect();
  await f.c.followWork; expect(f.calls).toEqual(['a']); expect(f.c.phase).toBe('offline');
});
test('watcher ignores other users and mute-only updates, but not other guilds', () => {
  // Only the two lookups watchUser makes are stubbed; the rest of a Client is never reached.
  const emitter = new EventEmitter();
  const client = fake<ClientLike>(Object.assign(emitter, {
    isReady: () => true,
    guilds: { cache: new Map([[guildId, { id: guildId, voiceStates: { cache: new Map([['owner', { channelId: 'a' }]]) } }]]) }
  }));
  const adapter = new DiscordAdapter();
  adapter.client = client;
  const seen: (VoiceLocation | null)[] = [];
  const stop = adapter.watchUser('owner', location => seen.push(location));
  const event = (id: string, guild: string, channel: string): boolean =>
    emitter.emit('voiceStateUpdate', { channelId: 'a' }, { id, guild: { id: guild }, channelId: channel });
  event('other', guildId, 'b');           // another member
  event('owner', guildId, 'a');             // same channel: a mute or deafen toggle
  event('owner', 'other-guild', 'b');       // a move to another server IS followed
  event('owner', guildId, 'c');
  stop();
  event('owner', guildId, 'd');             // after stop: ignored
  expect(seen).toEqual([
    { guildId, channelId: 'a' },
    { guildId: 'other-guild', channelId: 'b' },
    { guildId, channelId: 'c' }
  ]); expect(emitter.listenerCount('voiceStateUpdate')).toBe(0);
});

test('follow + listen remains scoped to Owner across rooms, without enabling STT', async () => {
  const f = setup(); const options: AdapterJoinOptions[] = [];
  f.adapter.join = async (_channel: VoiceChannel, opts: AdapterJoinOptions) => { options.push(opts); };
  await expect(f.c.startFollow({ listen: true })).rejects.toThrow('consent');
  await f.c.startFollow({ listen: true, consent: true });
  expect(f.c.state().following?.listen).toBe(true);
  expect(options[0]!.listen).toBe(true); expect(options[0]!.listenUserId).toBe('100000000000000001');
  expect(options[0]!.transcribe).toBe(false);
  f.change('b'); await f.c.followWork;
  expect(options[1]!.listen).toBe(true); expect(options[1]!.listenUserId).toBe('100000000000000001');
});
test('follow can upgrade existing same-room join-only session to Owner listener', async () => {
  const f = setup(); await f.c.startFollow();
  await f.c.startFollow({ listen: true, consent: true });
  expect(f.calls).toEqual(['a', 'a']); expect(f.c.channel?.listen).toBe(true);
});
test('disconnect removes follow intent and listener even with no pending moves', async () => {
  const f = setup(); await f.c.startFollow(); f.c.disconnect();
  expect(f.c.state().following).toBeNull(); expect(f.unwatched()).toBe(true);
});

test('follow crosses servers, and reports which one it is in', async () => {
  const f = setup();
  await f.c.startFollow();
  expect(f.calls).toEqual(['a']);
  expect(f.c.state().following?.guildId).toBe(guildId);

  // Owner leaves the home server entirely and turns up in another server's voice channel.
  f.change('z', 'other-guild');
  await f.c.followWork;
  expect(f.calls).toEqual(['a', 'z']);
  expect(f.c.channel?.guildId).toBe('other-guild');
  expect(f.c.state().following?.guildId).toBe('other-guild');

  // Out of voice altogether: the bot leaves but keeps following.
  f.change(null);
  await f.c.followWork;
  expect(f.c.phase).toBe('ready');
  expect(f.c.state().following?.guildId).toBeNull();
  expect(f.c.follow).not.toBeNull();
});

test('same channel id in two servers is not treated as the same room', async () => {
  const f = setup();
  f.c.channels.push({ id: 'a', guildId: 'other-guild', name: 'a', guildName: 'Makers' });
  await f.c.startFollow();
  expect(f.calls).toEqual(['a']);

  // Identical channel id, different server — it must rejoin, not stay put.
  f.change('a', 'other-guild');
  await f.c.followWork;
  expect(f.calls).toEqual(['a', 'a']);
  expect(f.c.channel?.guildId).toBe('other-guild');
});

test('auto-follow is off unless named, and listen cannot be reached by accident', () => {
  expect(autoFollowMode(undefined)).toBe('off');
  expect(autoFollowMode('')).toBe('off');
  expect(autoFollowMode('yes')).toBe('off');
  expect(autoFollowMode('1')).toBe('join');
  expect(autoFollowMode('true')).toBe('join');
  expect(autoFollowMode('join')).toBe('join');
  // Listening decodes other people's audio; only the exact word gets there.
  expect(autoFollowMode('listen')).toBe('listen');
});

test('connect starts following when auto-follow is on, and stays put when off', async () => {
  const off = setup();
  off.c.autoFollow = 'off';
  off.c.token = 'test-token-not-real';
  off.c.phase = 'offline';
  await off.c.connect();
  expect(off.c.follow).toBeNull();
  expect(off.calls).toEqual([]);

  const on = setup();
  on.c.autoFollow = 'join';
  on.c.token = 'test-token-not-real';
  on.c.phase = 'offline';
  await on.c.connect();
  expect(on.c.follow).not.toBeNull();
  expect(on.c.state().following?.listen).toBe(false);
});

/** A follow that cannot start must not make Connect look broken. */
test('a failing auto-follow leaves the bot connected and says why', async () => {
  const f = setup();
  f.c.autoFollow = 'join';
  f.c.token = 'test-token-not-real';
  f.c.phase = 'offline';
  f.adapter.watchUser = () => { throw new Error('guild gone'); };
  await f.c.connect();
  // Read through the public surface: the assignment above narrows the field's
  // literal type, and the point of the test is what a caller would observe.
  expect(f.c.state().phase).toBe('ready');
  expect(f.c.error).toContain('Auto-follow did not start');
});
