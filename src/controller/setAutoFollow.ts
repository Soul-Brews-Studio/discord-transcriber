import type { AutoFollowMode, ControllerState } from '../types.ts';
import { autoFollow } from './autoFollow.ts';

/**
 * Changes the auto-follow mode while the app is running.
 *
 * Turning it on applies immediately when the bot is already connected —
 * otherwise the setting would sit there looking enabled and do nothing until
 * the next reconnect. Turning it off only stops future connects; it does not
 * yank the bot out of a channel it is already in, because that is `stop-follow`
 * and the two should not be the same button.
 */
export async function setAutoFollow(controller: ControllerState, mode: AutoFollowMode): Promise<void> {
  controller.autoFollow = mode;
  if (mode !== 'off' && !controller.follow) await autoFollow(controller);
}
