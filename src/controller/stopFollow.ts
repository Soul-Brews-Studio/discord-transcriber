import type { ControllerState } from '../types.ts';

/** Stops watching the followed user. Does not leave the current channel. */
export function stopFollow(controller: ControllerState): void {
  controller.follow = null;
  controller.followLocation = null;
  controller.unwatch?.();
  controller.unwatch = null;
}
