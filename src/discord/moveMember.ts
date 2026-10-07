import type { AdapterState } from './types.ts';

/**
 * Moves a member who is already connected to voice into another channel.
 *
 * Discord has no "pull someone into voice". `PATCH /guilds/{id}/members/{user}`
 * with a `channel_id` *moves* a connected member and fails for one who is not
 * connected — a protocol limit, not a permission one, so Administrator does not
 * lift it. The connected check therefore runs here and says what to do, rather
 * than letting Discord answer with a generic 400 the operator has to decode.
 *
 * `MOVE_MEMBERS` is still required, and the caller supplies the user id: this
 * moves a real person's client, so the decision of *whose* belongs one layer up
 * where it is pinned to a single account.
 */
export async function moveMember(adapter: AdapterState, guildId: string, userId: string,
                                 channelId: string): Promise<void> {
  const guild = adapter.client?.guilds.cache.get(guildId);
  if (!guild) throw new Error('Not in that server.');
  if (!guild.voiceStates.cache.get(userId)?.channelId) {
    // Voice membership is per guild. Being connected in another server is not
    // being connected in this one, and Discord has no move that crosses the
    // boundary — so the message names the server rather than saying "join any
    // channel", which reads as a lie to someone who is plainly already talking.
    throw new Error(`Not connected to voice in ${guild.name}. Discord only moves you between `
      + 'channels of the server you are already in — join one there first, or move yourself.');
  }
  const member = await guild.members.fetch?.(userId);
  const voice = member?.voice;
  if (!voice?.setChannel) throw new Error('That account cannot be moved from here.');
  await voice.setChannel(channelId);
}
