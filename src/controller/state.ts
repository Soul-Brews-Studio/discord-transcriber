import { groupClips } from '../clips/groupClips.ts';
import { buildInvites } from '../discord/buildInvites.ts';
import type { ControllerState, PublicState } from '../types.ts';

/**
 * The payload served by `GET /api/state`. The token is never a field here —
 * only whether one is configured.
 */
export function state(controller: ControllerState): PublicState {
  return {
    following: controller.follow
      ? { userId: controller.follow.userId, listen: controller.follow.listen,
          guildId: controller.followLocation?.guildId ?? null }
      : null,
    audio: controller.adapter.audioState?.() ?? null,
    phase: controller.phase,
    channels: controller.channels,
    rows: controller.rows,
    channel: controller.channel,
    bot: controller.bot,
    error: controller.error,
    configured: Boolean(controller.token),
    transcriptionConfigured: Boolean(controller.sttURL),
    invites: controller.bot ? buildInvites(controller.bot.id) : null,
    speechGate: controller.speechGate,
    autoFollow: controller.autoFollow,
    progress: controller.progress,
    stt: controller.stt,
    // What is actually running, not what is on offer. The socket exists and is
    // measured; nothing in this app speaks it yet, so saying "stream" here
    // would be a claim the transcript could not back up.
    sttTransport: controller.sttURL ? 'batch' : 'none',
    guilds: controller.adapter.guilds?.() ?? [],
    clipGroups: groupClips(controller.adapter.clips?.() ?? []),
    clipLimit: controller.adapter.clipLimit?.() ?? 0
  };
}
