/**
 * Invite permission bitfields.
 *
 * `MINIMAL` is what this bot actually needs: see a voice channel and enter it.
 * It sends no audio, reads no messages and posts nothing, so nothing else is
 * exercised — a channel that is still invisible after inviting with MINIMAL
 * has a per-channel override, which Administrator would mask rather than fix.
 *
 * `ADMINISTRATOR` grants every permission in the guild, including deleting
 * channels, banning members and editing roles. It is offered because it is
 * sometimes asked for, not because this app needs it.
 */
export const InvitePermissions = {
  /** ViewChannel (1 << 10) | Connect (1 << 20) */
  MINIMAL: 1049600n,
  /** Administrator (1 << 3) */
  ADMINISTRATOR: 8n
} as const;
