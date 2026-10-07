import type { GuildChannelLike, GuildMemberLike } from './types.ts';

/**
 * A voice channel this bot can both see and enter. Both permissions are
 * required: a channel the bot can see but not enter would only fail at join
 * time, so it never belongs in the picker.
 */
export function isJoinableVoice(
  channel: GuildChannelLike | undefined,
  me: GuildMemberLike,
  voiceType: number,
  required: readonly bigint[]
): channel is GuildChannelLike {
  if (channel?.type !== voiceType) return false;
  return channel.permissionsFor(me)?.has(required) === true;
}
