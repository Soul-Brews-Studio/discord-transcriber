import { InvitePermissions } from './invitePermissions.ts';

/**
 * The OAuth2 URL that adds this bot to a guild.
 *
 * `client_id` is the application ID, which for a bot is the same snowflake as
 * its user ID — so it comes from the live connection rather than configuration
 * that could drift out of date.
 */
export function inviteURL(clientId: string, permissions: bigint = InvitePermissions.MINIMAL): string {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', 'bot');
  url.searchParams.set('permissions', permissions.toString());
  return url.toString();
}
