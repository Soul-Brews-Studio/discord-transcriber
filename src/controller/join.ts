import type { ControllerState, JoinOptions, TranscriptRow } from '../types.ts';
import { leave } from './leave.ts';
import { validateJoin } from './validateJoin.ts';

/** Newest rows only. The transcript is memory, not a store. */
const ROW_LIMIT = 100;

/** Joins one channel from this bot's own channel list. */
export async function join(controller: ControllerState, options: JoinOptions): Promise<void> {
  const channel = validateJoin(controller, options);
  const transcribe = options.transcribe ?? false;
  const listen = (options.listen ?? false) || transcribe;
  const listenUserId = options.listenUserId ?? null;

  const generation = ++controller.generation;
  controller.phase = 'joining';
  controller.error = null;

  try {
    await controller.adapter.join(channel, {
      listen,
      listenUserId,
      transcribe,
      sttURL: controller.sttURL,
      onRow: (row: TranscriptRow) => {
        if (generation !== controller.generation) return;
        controller.rows = [...controller.rows, row].slice(-ROW_LIMIT);
      },
      onDisconnect: () => {
        if (generation !== controller.generation) return;
        leave(controller);
        controller.error = 'Voice connection interrupted; choose Join to reconnect.';
      }
    });
    if (generation !== controller.generation) return;
    controller.channel = { ...channel, listen, listenUserId, transcribe };
    controller.phase = 'joined';
  } catch {
    if (generation !== controller.generation) return;
    leave(controller, false);
    controller.error = 'Voice join failed. Check View Channel / Connect permissions, capacity, UDP and DAVE support.';
    throw new Error(controller.error);
  }
}
