import { test, expect } from 'bun:test';
import { watchVoiceActivity } from '../src/discord/watchVoiceActivity.ts';
import { listGuilds } from '../src/discord/listGuilds.ts';
import type { AdapterState, VoiceStateUpdate } from '../src/discord/types.ts';
import { fake } from './support/fake.ts';

type Listener = (older: VoiceStateUpdate, newer: VoiceStateUpdate) => void;

function setup(seated: Record<string, string[]> = {}, bots: string[] = []) {
  let listener: Listener | undefined;
  const guilds = ['g1', 'g2'].map(id => ({
    id, name: id === 'g1' ? 'Alpha' : 'Beta',
    voiceStates: { cache: { entries: () => Object.entries(seated[id] ?? {}).length
      ? [][Symbol.iterator]()
      : (seated[id] ?? []).map(u => [u, { channelId: 'c' }] as [string, { channelId: string | null }])[Symbol.iterator]() } }
  }));
  const adapter = fake<AdapterState>({
    humanActivity: new Map<string, number>(),
    stopVoiceActivity: null,
    client: {
      isReady: () => true,
      guilds: { cache: { values: () => guilds[Symbol.iterator]() } },
      users: { cache: { get: (id: string) => (bots.includes(id) ? { bot: true } : { bot: false }) } },
      on: (_event: string, fn: Listener) => { listener = fn; },
      off: () => { listener = undefined; }
    }
  });
  const move = (id: string, guildId: string, from: string | null, to: string | null): void => {
    listener?.(fake<VoiceStateUpdate>({ id, guild: { id: guildId }, channelId: from }),
               fake<VoiceStateUpdate>({ id, guild: { id: guildId }, channelId: to }));
  };
  return { adapter, move, stop: () => adapter.stopVoiceActivity?.() };
}

test('a person arriving marks that server, and only that server', () => {
  const f = setup();
  f.adapter.stopVoiceActivity = watchVoiceActivity(f.adapter);
  f.move('human', 'g2', null, 'channel-1');
  expect(f.adapter.humanActivity.has('g2')).toBe(true);
  expect(f.adapter.humanActivity.has('g1')).toBe(false);
});

test('bots do not make a server recent', () => {
  const f = setup({}, ['robot']);
  f.adapter.stopVoiceActivity = watchVoiceActivity(f.adapter);
  f.move('robot', 'g1', null, 'channel-1');
  expect(f.adapter.humanActivity.size).toBe(0);
});

test('leaving is not arriving, and neither is a mute', () => {
  const f = setup();
  f.adapter.stopVoiceActivity = watchVoiceActivity(f.adapter);
  f.move('human', 'g1', 'channel-1', null);            // left
  f.move('human', 'g2', 'channel-1', 'channel-1');     // muted: same channel
  expect(f.adapter.humanActivity.size).toBe(0);
});

test('a later arrival wins, so the newest server sorts first', async () => {
  const f = setup();
  f.adapter.stopVoiceActivity = watchVoiceActivity(f.adapter);
  f.move('human', 'g1', null, 'c');
  await Bun.sleep(2);
  f.move('human', 'g2', null, 'c');
  const [first, second] = [...f.adapter.humanActivity.entries()]
    .sort((a, b) => b[1] - a[1]).map(([id]) => id);
  expect(first).toBe('g2');
  expect(second).toBe('g1');
});

test('unwatching stops the recording', () => {
  const f = setup();
  f.adapter.stopVoiceActivity = watchVoiceActivity(f.adapter);
  f.stop();
  f.move('human', 'g1', null, 'c');
  expect(f.adapter.humanActivity.size).toBe(0);
});

test('a server nobody has entered reports null rather than a guessed time', () => {
  const adapter = fake<AdapterState>({
    humanActivity: new Map([['g1', 1234]]),
    client: {
      guilds: { cache: { values: () => [{
        id: 'g1', name: 'Alpha', members: { me: { id: 'bot' } },
        channels: { cache: { values: () => [{ id: 'c1', name: 'General', type: 2,
          permissionsFor: () => ({ has: () => true }) }][Symbol.iterator]() } },
        voiceStates: { cache: { get: () => undefined, entries: () => [][Symbol.iterator]() } }
      }, {
        id: 'g2', name: 'Beta', members: { me: { id: 'bot' } },
        channels: { cache: { values: () => [{ id: 'c2', name: 'General', type: 2,
          permissionsFor: () => ({ has: () => true }) }][Symbol.iterator]() } },
        voiceStates: { cache: { get: () => undefined, entries: () => [][Symbol.iterator]() } }
      }][Symbol.iterator]() } },
      users: { cache: { get: () => undefined } },
      user: { id: 'bot' }
    },
    speaking: new Set<string>()
  });
  const guilds = listGuilds(adapter, 2, []);
  expect(guilds.find(g => g.id === 'g1')?.lastHumanAt).toBe(1234);
  expect(guilds.find(g => g.id === 'g2')?.lastHumanAt).toBeNull();
});
