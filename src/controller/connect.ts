import type { ControllerState } from '../types.ts';
import { autoFollow } from './autoFollow.ts';
import { probeCapabilities } from '../stt/probeCapabilities.ts';
import { disconnect } from './disconnect.ts';

/**
 * Authenticates the bot and loads the channels it can reach. It never joins —
 * that is always a separate, deliberate call.
 *
 * SDK errors are swallowed rather than forwarded: a login failure can carry the
 * token in its message, and this error text reaches the browser.
 */
export async function connect(controller: ControllerState): Promise<void> {
  if (controller.phase !== 'offline') throw new Error('Disconnect before reconnecting.');
  if (!controller.token) throw new Error('Set DISCORD_BOT_TOKEN in this app’s environment first.');

  const generation = ++controller.generation;
  const loginGeneration = ++controller.loginGeneration;
  controller.phase = 'connecting';
  controller.error = null;
  // Connect logs in and then sweeps every guild for channels, which takes long
  // enough that silence reads as a hang. The page polls this once a second.
  controller.progress = 'authenticating with Discord…';

  try {
    const result = await controller.adapter.connect(
      controller.token,
      message => {
        if (loginGeneration !== controller.loginGeneration) return;
        disconnect(controller);
        controller.error = message;
      },
      step => {
        if (generation === controller.generation) controller.progress = step;
      });
    if (generation !== controller.generation) { controller.progress = null; return; }
    if (!result.bot?.isBot) throw new Error('A proper Discord bot account is required.');
    controller.bot = result.bot;
    controller.channels = result.channels;
    controller.phase = 'ready';
    // Asked once per connect, and never awaited by anything that matters: a
    // service that is slow to describe itself must not delay the bot, and one
    // that answers 404 is simply batch-only.
    void probeCapabilities(controller.sttURL).then(stt => { controller.stt = stt; });
    controller.progress = controller.autoFollow === 'off' ? null : 'following…';
    await autoFollow(controller);
    controller.progress = null;
  } catch {
    controller.progress = null;
    if (generation !== controller.generation) return;
    disconnect(controller);
    controller.error = 'Bot connection failed. Check the dedicated bot token, invite, intents and network.';
    throw new Error(controller.error);
  }
}
