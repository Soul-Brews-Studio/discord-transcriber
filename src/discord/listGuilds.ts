import { byName } from './byName.ts';
import { isJoinableVoice } from './isJoinableVoice.ts';
import { speakerName } from './speakerName.ts';
import type { ChannelView, GuildView, Occupant } from '../types.ts';
import type { AdapterState, ClientLike, GuildLike } from './types.ts';

/**
 * Servers, their reachable voice channels, and who is sitting in each one.
 *
 * Read from the live voice-state cache rather than the channel list built at
 * Connect, so occupancy is current even though the channel list is not. The
 * two are different facts and only one of them changes by the second.
 */
export function listGuilds(adapter: AdapterState, voiceType: number, required: readonly bigint[]): GuildView[] {
  const client = adapter.client;
  if (!client) return [];

  const guilds: GuildView[] = [];
  for (const guild of client.guilds.cache.values()) {
    // permissionsFor needs the guild member, not a user id. fetchMe() at
    // Connect populates `me`; without it every channel reads as unreachable
    // and the whole list comes back empty.
    const me = guild.members.me;
    if (!me) continue;
    const channels: ChannelView[] = [];
    for (const channel of guild.channels.cache.values()) {
      if (!isJoinableVoice(channel, me, voiceType, required)) continue;
      channels.push({
        id: channel.id, guildId: guild.id, name: channel.name, guildName: guild.name,
        occupants: occupantsOf(client, guild, channel.id, adapter)
      });
    }
    if (channels.length) {
      guilds.push({
        id: guild.id, name: guild.name, channels: channels.sort(byName),
        lastHumanAt: adapter.humanActivity.get(guild.id) ?? null
      });
    }
  }
  // Sorted, not cache order. Occupancy is recomputed on every frame, and
  // anything that reorders as people move makes the grid jump under a cursor
  // that was aiming at a room.
  return guilds.sort(byName);
}

function occupantsOf(client: ClientLike, guild: GuildLike, channelId: string, adapter: AdapterState): Occupant[] {
  const people: Occupant[] = [];
  for (const [userId, voice] of entriesOf(guild)) {
    if (voice.channelId !== channelId) continue;
    const user = client.users.cache.get(userId);
    people.push({
      id: userId,
      name: speakerName(client, userId),
      bot: Boolean(user?.bot),
      avatar: `/api/avatar/${userId}`,
      self: userId === client.user?.id,
      speaking: adapter.speaking.has(userId)
    });
  }
  return people;
}

function entriesOf(guild: GuildLike): Iterable<[string, { channelId: string | null }]> {
  const cache = guild.voiceStates.cache as unknown as { entries?(): IterableIterator<[string, { channelId: string | null }]> };
  return cache.entries?.() ?? [];
}
