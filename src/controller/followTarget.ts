import type { FollowTarget } from '../types.ts';

/**
 * The one account this app will ever follow: FOLLOW_USER_ID, read once at
 * startup. Never accepted as request input, so no request can aim the follow
 * at another member.
 *
 * No guild is fixed: the follow spans every server this bot and that account
 * are both in, and the guild comes from whichever voice event fires.
 */
export const FOLLOW_USER_ID = (process.env.FOLLOW_USER_ID ?? '').trim();

export function followTarget(listen: boolean): FollowTarget {
  if (!FOLLOW_USER_ID) throw new Error('FOLLOW_USER_ID is not set: following is disabled.');
  return { userId: FOLLOW_USER_ID, listen };
}
