import type { BringOptions, ControllerState } from '../types.ts';
import { FOLLOW_USER_ID } from './followTarget.ts';

/**
 * Brings the followed account to a channel — follow, inverted.
 *
 * The account is hard-coded for the same reason the follow target is: this
 * moves a real person's client between rooms, and no request should be able to
 * aim it at somebody else. The destination defaults to wherever the bot is
 * sitting, so "bring me to the bot" needs no arguments at all.
 */
export async function bring(state: ControllerState, options: BringOptions = {}): Promise<void> {
  const guildId = options.guildId ?? state.channel?.guildId;
  const channelId = options.channelId ?? state.channel?.id;
  if (!guildId || !channelId) {
    throw new Error('No destination — drop on a channel, or have the bot join one first.');
  }
  if (!state.adapter.moveMember) throw new Error('This transport cannot move members.');
  await state.adapter.moveMember(guildId, FOLLOW_USER_ID, channelId);
}
