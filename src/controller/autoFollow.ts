import type { ControllerState } from '../types.ts';
import { startFollow } from './startFollow.ts';

/**
 * Starts following as soon as Connect succeeds, when configured to.
 *
 * Connect is still the deliberate human action; this removes the second click,
 * not the decision. Failure is swallowed into `error` rather than thrown — a
 * follow that cannot start must not make Connect itself look broken, because
 * the bot really is connected either way.
 */
export async function autoFollow(controller: ControllerState): Promise<void> {
  if (controller.autoFollow === 'off') return;
  if (controller.phase !== 'ready') return;
  // Setting the variable IS the consent: 'listen' and 'transcribe' can only be
  // reached by spelling them out, and the operator who typed one has asserted
  // the same thing the checkbox asserts.
  const transcribe = controller.autoFollow === 'transcribe';
  const listen = transcribe || controller.autoFollow === 'listen';
  try {
    await startFollow(controller, { listen, transcribe, consent: listen ? true : undefined });
  } catch (error) {
    controller.error = `Auto-follow did not start: ${(error as Error).message}`;
  }
}
