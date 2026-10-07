import { test, expect } from 'bun:test';
import { Controller } from '../src/controller.ts';
import { moveMember } from '../src/discord/moveMember.ts';
import { runAction } from '../src/server/runAction.ts';
import { FOLLOW_USER_ID } from '../src/controller/followTarget.ts';
import type { Adapter, ConnectResult, ControllerApi, VoiceChannel } from '../src/types.ts';
import type { AdapterState, GuildMemberLike } from '../src/discord/types.ts';
import { fake } from './support/fake.ts';

const guildId = '200000000000000002';
const channelId = '2000000000000000268';

interface MoveCall { guildId: string; userId: string; channelId: string }

function controller(joined: boolean): { c: Controller; moves: MoveCall[] } {
  const moves: MoveCall[] = [];
  const adapter: Adapter = {
    async connect(): Promise<ConnectResult> {
      return { bot: { id: '7', name: 'Test Bot', isBot: true }, channels: [] };
    },
    async join(): Promise<void> {},
    leave(): void {},
    disconnect(): void {},
    async moveMember(g: string, u: string, ch: string): Promise<void> {
      moves.push({ guildId: g, userId: u, channelId: ch });
    }
  };
  const c = new Controller(adapter);
  if (joined) {
    const channel: VoiceChannel = { id: channelId, guildId, name: 'general', guildName: 'the home server' };
    c.channel = { ...channel, listen: false, listenUserId: null, transcribe: false };
    c.phase = 'joined';
  }
  return { c, moves };
}

/** A guild whose voice-state cache decides whether the member is connected. */
function adapterWith(connectedTo: string | null, member?: GuildMemberLike): AdapterState {
  const setCalls: (string | null)[] = [];
  const guild = {
    id: guildId,
    voiceStates: { cache: { get: (id: string) => (id === FOLLOW_USER_ID && connectedTo
      ? { channelId: connectedTo } : undefined) } },
    members: {
      fetch: async (): Promise<GuildMemberLike> => member ?? {
        id: FOLLOW_USER_ID,
        voice: { channelId: connectedTo, setChannel: async (to: string | null) => { setCalls.push(to); } }
      }
    }
  };
  const state = fake<AdapterState>({ client: { guilds: { cache: { get: (id: string) => (id === guildId ? guild : undefined) } } } });
  return Object.assign(state, { setCalls } as unknown as AdapterState);
}

test('bring moves the followed account to the bot’s channel with no arguments', async () => {
  const { c, moves } = controller(true);
  await c.bring();
  expect(moves).toEqual([{ guildId, userId: FOLLOW_USER_ID, channelId }]);
});

test('bring accepts an explicit destination', async () => {
  const { c, moves } = controller(false);
  await c.bring({ guildId, channelId: '2000000000000000999' });
  expect(moves).toEqual([{ guildId, userId: FOLLOW_USER_ID, channelId: '2000000000000000999' }]);
});

test('bring refuses when there is nowhere to go', async () => {
  const { c, moves } = controller(false);
  await expect(c.bring()).rejects.toThrow(/No destination/);
  expect(moves).toEqual([]);
});

test('the account moved is never taken from the request', async () => {
  const { c, moves } = controller(true);
  // A body carrying a user id must not change who is moved. runAction reads
  // only the two ids; anything else in the body is ignored by construction.
  const api = fake<ControllerApi>(c);
  await runAction(api, '/api/bring',
    new Request('http://127.0.0.1/api/bring',
      { method: 'POST', body: JSON.stringify({ userId: '999999999999999999' }) }));
  expect(moves).toEqual([{ guildId, userId: FOLLOW_USER_ID, channelId }]);
});

test('runAction rejects an id that is not a snowflake', async () => {
  const { c, moves } = controller(true);
  const api = fake<ControllerApi>(c);
  await expect(runAction(api, '/api/bring',
    new Request('http://127.0.0.1/api/bring',
      { method: 'POST', body: JSON.stringify({ channelId: 'general' }) })))
    .rejects.toThrow(/Invalid channel or server ID/);
  expect(moves).toEqual([]);
});

test('moveMember refuses a member not in voice IN THAT SERVER — the protocol, not permissions', async () => {
  // Voice membership is per guild: being connected in another server is not
  // being connected in this one, and no permission changes that. The message
  // has to name the server, or someone plainly mid-conversation reads "join a
  // voice channel first" as simply wrong.
  await expect(moveMember(adapterWith(null), guildId, FOLLOW_USER_ID, channelId))
    .rejects.toThrow(/Not connected to voice in/);
});

test('moveMember sets the channel on a connected member', async () => {
  const state = adapterWith('2000000000000000111');
  await moveMember(state, guildId, FOLLOW_USER_ID, channelId);
  expect((state as unknown as { setCalls: string[] }).setCalls).toEqual([channelId]);
});

test('moveMember reports an unknown server rather than moving nobody quietly', async () => {
  await expect(moveMember(adapterWith('x'), '2000000000000009999', FOLLOW_USER_ID, channelId))
    .rejects.toThrow(/Not in that server/);
});
