import type { AutoFollowMode, BringOptions, ControllerApi, JoinOptions, StartFollowOptions } from '../types.ts';
import { autoFollowMode } from '../controller/autoFollowMode.ts';
import { readBody } from './readBody.ts';

/**
 * Performs one control action. Returns false for an unknown path so the caller
 * can answer 404 rather than silently succeeding.
 *
 * The body is passed through to the controller unvalidated on purpose: the
 * controller is the single place that decides what a join may be, and copying
 * those rules here would let the two drift apart.
 */
export async function runAction(controller: ControllerApi, path: string, request: Request): Promise<boolean> {
  switch (path) {
    case '/api/connect':
      await controller.connect();
      return true;
    case '/api/stop-follow':
      controller.stopFollow();
      controller.leave();
      return true;
    case '/api/join':
      await controller.join(await readBody(request) as unknown as JoinOptions);
      return true;
    case '/api/follow-me':
      await controller.startFollow(await readBody(request) as unknown as StartFollowOptions);
      return true;
    case '/api/auto-follow': {
      const body = await readBody(request);
      // Parsed through the same reader as the env var, so 'listen' is still the
      // only spelling that reaches the listening mode.
      const mode: AutoFollowMode = autoFollowMode(String(body.mode ?? ''));
      await controller.setAutoFollow?.(mode);
      return true;
    }
    case '/api/bring': {
      const body = await readBody(request);
      // Validated here rather than passed through, unlike join: these two ids
      // are the only part of the request that reaches Discord, and the account
      // being moved is fixed in the controller. An id that is not a snowflake
      // can only be a mistake or an attempt.
      const bring: BringOptions = {};
      for (const key of ['guildId', 'channelId'] as const) {
        const raw = body[key];
        if (raw === undefined || raw === null) continue;
        const id = String(raw);
        if (!/^\d{17,20}$/.test(id)) throw new Error('Invalid channel or server ID.');
        bring[key] = id;
      }
      await controller.bring?.(bring);
      return true;
    }
    case '/api/leave-guild': {
      const body = await readBody(request);
      const guildId = String(body.guildId ?? '');
      if (!/^\d{17,20}$/.test(guildId)) throw new Error('Invalid server ID.');
      await controller.leaveGuild?.(guildId);
      return true;
    }
    case '/api/leave':
      controller.leave();
      return true;
    case '/api/disconnect':
      controller.disconnect();
      return true;
    case '/api/clear':
      controller.clear();
      return true;
    default:
      return false;
  }
}
