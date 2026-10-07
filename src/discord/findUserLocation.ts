import type { VoiceLocation } from '../types.ts';
import type { ClientLike } from './types.ts';

/**
 * Where a member is sitting right now, across every guild this bot is in.
 *
 * Swept once when following starts, because someone may already be in a
 * channel — waiting for a move would leave the bot outside until they happened
 * to switch.
 */
export function findUserLocation(client: ClientLike, userId: string): VoiceLocation | null {
  for (const guild of client.guilds.cache.values()) {
    const channelId = guild.voiceStates.cache.get(userId)?.channelId;
    if (channelId) return { guildId: guild.id, channelId };
  }
  return null;
}
