import type { ControllerState, JoinOptions, VoiceChannel } from '../types.ts';

/** A Discord snowflake, which is all a user ID may ever be here. */
const SNOWFLAKE = /^\d{17,20}$/;

/**
 * Checks a join request before anything touches the network, and resolves it to
 * a channel from this bot's own list — an arbitrary ID is never accepted.
 *
 * Transcription implies listening, so `listen` is widened rather than trusted,
 * and consent is required for whichever of the two ends up true.
 */
export function validateJoin(controller: ControllerState, options: JoinOptions): VoiceChannel {
  if (controller.phase !== 'ready') throw new Error('Connect first; leave the current channel before another join.');

  const channel = controller.channels.find(c => c.guildId === options.guildId && c.id === options.channelId);
  if (!channel) throw new Error('Select an accessible voice channel from this bot’s channel list.');

  const transcribe = options.transcribe ?? false;
  const listenUserId = options.listenUserId ?? null;
  if (typeof transcribe !== 'boolean') throw new Error('Invalid transcription option.');
  if (typeof (options.listen ?? false) !== 'boolean') throw new Error('Invalid listening option.');
  if (listenUserId !== null && (typeof listenUserId !== 'string' || !SNOWFLAKE.test(listenUserId))) {
    throw new Error('Invalid listening user ID.');
  }

  const listen = (options.listen ?? false) || transcribe;
  if (listen && options.consent !== true) throw new Error('Listening requires participant consent confirmation.');
  if (transcribe && (!controller.sttURL || options.consent !== true)) {
    throw new Error('Transcription requires an MLX endpoint and participant consent confirmation.');
  }
  return channel;
}
