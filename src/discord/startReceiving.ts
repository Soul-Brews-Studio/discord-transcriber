import type { ReceiveOptions } from '../types.ts';
import { captureSpeaker } from './captureSpeaker.ts';
import type { AdapterState, OpusScriptConstructor, VoiceConnectionLike } from './types.ts';

/**
 * Starts capturing whoever speaks.
 *
 * The existing speakers are swept once after subscribing: someone may already
 * be talking when the connection turns Ready, and waiting for the next 'start'
 * event would miss them until they paused.
 */
export function startReceiving(
  adapter: AdapterState,
  connection: VoiceConnectionLike,
  options: ReceiveOptions,
  OpusScript: OpusScriptConstructor
): void {
  const generation = adapter.generation;
  const capture = (userId: string): void =>
    captureSpeaker(adapter, connection, options, OpusScript, generation, userId);

  // Discord reports speaking start and end per user. Tracking both gives a live
  // set rather than a last-seen name, which is the difference between "who is
  // talking" and "who talked most recently".
  const began = (userId: string): void => { adapter.speaking.add(userId); capture(userId); };
  const ended = (userId: string): void => { adapter.speaking.delete(userId); };

  connection.receiver.speaking.on('start', began);
  connection.receiver.speaking.on('end', ended);
  adapter.stopReceiving = () => {
    connection.receiver.speaking.off('start', began);
    connection.receiver.speaking.off('end', ended);
    adapter.speaking.clear();
  };
  for (const userId of connection.receiver.speaking.users?.keys() ?? []) began(userId);
}
