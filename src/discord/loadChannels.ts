import type { OnProgress, VoiceChannel } from '../types.ts';
import { isJoinableVoice } from './isJoinableVoice.ts';
import type { ClientLike } from './types.ts';

/** Every voice channel this bot can both see and connect to, across all guilds. */
export async function loadChannels(
  client: ClientLike,
  voiceType: number,
  required: readonly bigint[],
  onProgress?: OnProgress
): Promise<VoiceChannel[]> {
  const channels: VoiceChannel[] = [];
  const guilds = [...client.guilds.cache.values()];
  let done = 0;
  for (const guild of guilds) {
    onProgress?.(`reading channels — ${guild.name} (${++done}/${guilds.length})`);
    await guild.channels.fetch();
    const me = await guild.members.fetchMe();
    for (const channel of guild.channels.cache.values()) {
      if (!isJoinableVoice(channel, me, voiceType, required)) continue;
      channels.push({ id: channel.id, guildId: guild.id, name: channel.name, guildName: guild.name });
    }
  }
  return channels;
}
