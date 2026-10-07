import type { ControllerState } from '../types.ts';
import { stopFollow } from './stopFollow.ts';

/**
 * Leaves the voice channel. Bumping `generation` invalidates any row or
 * disconnect callback still in flight from the join being abandoned.
 *
 * `stopFollowing` is false when following moves the bot between channels —
 * that leave must not cancel the follow that requested it.
 */
export function leave(controller: ControllerState, stopFollowing = true): void {
  if (stopFollowing) stopFollow(controller);
  if (controller.phase !== 'joining' && controller.phase !== 'joined') return;
  ++controller.generation;
  controller.adapter.leave();
  controller.channel = null;
  controller.phase = 'ready';
}
