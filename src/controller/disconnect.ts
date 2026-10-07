import type { ControllerState } from '../types.ts';
import { stopFollow } from './stopFollow.ts';

/** Closes the gateway and forgets everything the session learned. */
export function disconnect(controller: ControllerState): void {
  stopFollow(controller);
  ++controller.loginGeneration;
  ++controller.generation;
  controller.adapter.disconnect();
  controller.channel = null;
  controller.channels = [];
  controller.bot = null;
  controller.phase = 'offline';
  controller.progress = null;
}
