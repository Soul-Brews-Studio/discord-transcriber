import type { ControllerState, FollowTarget, StartFollowOptions, VoiceLocation } from '../types.ts';
import { followTarget } from './followTarget.ts';
import { isAlreadyThere } from './isAlreadyThere.ts';
import { join } from './join.ts';
import { leave } from './leave.ts';
import { stopFollow } from './stopFollow.ts';

/**
 * Follows one authorized account wherever they are, across every server this
 * bot shares with them, and moves when they move.
 *
 * Moves are serialised through `followWork`, and each carries a revision:
 * someone hopping between channels fires several events, and without the
 * revision an older join could land after a newer one and strand the bot in a
 * room they already left.
 *
 * Transcription is off unless asked for by name. It is widened from `listen`
 * the same way `validateJoin` does it, because audio cannot be transcribed
 * without being decoded first, and both need the same consent.
 */
export async function startFollow(controller: ControllerState, options: StartFollowOptions = {}): Promise<void> {
  if (controller.phase !== 'ready' && controller.phase !== 'joined') throw new Error('Connect first before following.');
  const transcribe = options.transcribe ?? false;
  if (typeof transcribe !== 'boolean') throw new Error('Invalid transcription option.');
  if (typeof (options.listen ?? false) !== 'boolean') throw new Error('Invalid listening option.');
  const listen = (options.listen ?? false) || transcribe;
  if (listen && options.consent !== true) throw new Error('Listening requires the followed account’s consent confirmation.');
  if (transcribe && !controller.sttURL) throw new Error('Transcription requires a local STT endpoint.');

  stopFollow(controller);
  const follow: FollowTarget = followTarget(listen);
  controller.follow = follow;
  const listenUserId = listen ? follow.userId : null;

  const moved = (location: VoiceLocation | null): void => {
    if (controller.follow !== follow) return;
    const revision = follow.revision = (follow.revision ?? 0) + 1;
    controller.followLocation = location;
    if (!isAlreadyThere(controller, location, listen, listenUserId)) leave(controller, false);
    controller.followWork = controller.followWork.catch(() => {}).then(async () => {
      if (controller.follow !== follow || follow.revision !== revision || !location) return;
      if (isAlreadyThere(controller, location, listen, listenUserId)) return;
      try {
        await join(controller, {
          guildId: location.guildId, channelId: location.channelId,
          listen, listenUserId, consent: options.consent, transcribe
        });
      } catch {
        if (controller.follow === follow && follow.revision === revision) {
          controller.error = 'Cannot follow into that channel. The bot may not be in that server, '
            + 'or the channel appeared after Connect — invite it, then press Connect again.';
        }
      }
    });
  };

  try {
    controller.unwatch = controller.adapter.watchUser?.(follow.userId, moved) ?? null;
  } catch {
    stopFollow(controller);
    throw new Error('Could not watch that account. Reconnect and retry.');
  }
  return controller.followWork;
}
