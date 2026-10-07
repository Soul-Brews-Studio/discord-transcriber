import type { ControllerState, VoiceLocation } from '../types.ts';

/**
 * Whether the bot is already joined to this exact channel in the mode the
 * follow wants. Without it, a voice-state event for the channel we are in would
 * leave and rejoin, cutting the audio for everyone.
 *
 * The guild is compared too: two servers can hold channels with the same name,
 * and after a cross-guild move only the pair identifies the room.
 */
export function isAlreadyThere(
  controller: ControllerState,
  location: VoiceLocation | null,
  listen: boolean,
  listenUserId: string | null
): boolean {
  if (!location) return false;
  return controller.phase === 'joined'
    && controller.channel?.id === location.channelId
    && controller.channel.guildId === location.guildId
    && controller.channel.listen === listen
    && controller.channel.listenUserId === listenUserId
    && !controller.channel.transcribe;
}
