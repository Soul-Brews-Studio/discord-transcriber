import { Controller } from '../controller.ts';
import { DiscordAdapter } from '../discord.ts';
import { createApp } from './createApp.ts';
import { localSTT } from './localSTT.ts';
import { parsePort } from './parsePort.ts';
import { controlToken } from './controlToken.ts';
import { bindHost, isLoopbackBind } from './bindHost.ts';
import { localOrigins } from './localOrigins.ts';
import { createHub } from '../push/createHub.ts';
import { startVad } from '../vad/startVad.ts';
import { autoFollowMode } from '../controller/autoFollowMode.ts';
import { clipLimit } from '../clips/clipLimit.ts';
import { createClipStore } from '../clips/createClipStore.ts';

/**
 * Starts the local control server. Nothing connects to Discord here — the
 * process comes up offline every time, even with a token configured.
 *
 * The control token is minted per process and lives only in memory.
 */
export async function main(): Promise<void> {
  const port = parsePort(process.env.PORT);
  const bind = bindHost(process.env.BIND);
  const origins = localOrigins(bind, port, process.env.ALLOW_HOSTS);
  const adapter = new DiscordAdapter();
  // Started before the server binds: loading the model takes seconds, and a
  // half-armed gate during the first utterances would be worse than waiting.
  const { vad, reason } = await startVad();
  adapter.vad = vad;
  const keep = clipLimit(process.env.KEEP_CLIPS);
  adapter.clipStore = createClipStore(keep);
  adapter.gate = vad ? reason : `energy only — ${reason}`;
  const controller = new Controller(adapter, {
    token: process.env.DISCORD_BOT_TOKEN ?? '',
    // STT_ALLOW_HOST is the container deployment's single named exception; it
    // is unset on this machine and the rule stays loopback-or-nothing.
    sttURL: localSTT(process.env.MLX_STT_URL, process.env.STT_ALLOW_HOST),
    speechGate: vad ? reason : `energy only — ${reason}`,
    autoFollow: autoFollowMode(process.env.AUTO_FOLLOW)
  });
  const control = controlToken();
  const hub = createHub();
  const app = createApp(controller, hub, { port, controlToken: control, origins });
  const server = app.listen({ hostname: bind, port, maxRequestBodySize: 2048 });

  const publish = (): void => hub.publish(controller.state());

  // Nothing in the controller emits events, so the push is driven by a fast
  // sampler. 100 ms is well inside human perception and still 10x cheaper than
  // shipping a frame per change; identical frames are dropped by the hub.
  const sampler = setInterval(publish, 100);
  console.log(`Discord Transcriber: http://127.0.0.1:${port} — offline; use Connect, then select a channel and Join.`);
  if (!isLoopbackBind(bind)) {
    // Printed with the token because off-loopback the index will not hand it
    // out. These URLs are the only way in from another device, and each one is
    // full control of the bot — the address is not a secret, the query is.
    console.log(`Bound to ${bind}: reachable from this network. Anyone holding a URL below controls the bot.`);
    for (const origin of origins) {
      if (origin.startsWith('http://127.0.0.1:')) continue;
      console.log(`  ${origin}/?t=${control}`);
    }
  }

  console.log(`Speech gate: ${vad ? reason : `energy only — ${reason}`}`);
  console.log(`Auto-follow: ${autoFollowMode(process.env.AUTO_FOLLOW)}`);
  console.log(`Live push: ws://127.0.0.1:${port}/ws`);
  console.log(`Clip timeline: ${keep ? `${keep} utterances, memory only` : 'off — no audio stored'}`);

  const stop = (): void => {
    clearInterval(sampler);
    controller.disconnect();
    vad?.stop();
    void server.stop(true);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
