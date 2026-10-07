import type { Invites } from '../types.ts';
import { InvitePermissions } from './invitePermissions.ts';
import { inviteURL } from './inviteURL.ts';

/**
 * Both invite links for a connected bot, so the choice between them is visible
 * side by side rather than decided by whichever one got written down.
 */
export function buildInvites(clientId: string): Invites {
  return {
    minimal: inviteURL(clientId, InvitePermissions.MINIMAL),
    administrator: inviteURL(clientId, InvitePermissions.ADMINISTRATOR)
  };
}
