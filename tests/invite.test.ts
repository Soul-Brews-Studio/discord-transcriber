import { test, expect } from 'bun:test';
import { buildInvites } from '../src/discord/buildInvites.ts';
import { InvitePermissions } from '../src/discord/invitePermissions.ts';
import { inviteURL } from '../src/discord/inviteURL.ts';

const clientId = '1516944299181473902';

test('minimal invite asks for View Channel and Connect, and nothing else', () => {
  const url = new URL(inviteURL(clientId));
  expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
  expect(url.searchParams.get('client_id')).toBe(clientId);
  expect(url.searchParams.get('scope')).toBe('bot');
  // 1 << 10 | 1 << 20 — the two this bot uses.
  expect(url.searchParams.get('permissions')).toBe('1049600');
  expect(BigInt(InvitePermissions.MINIMAL)).toBe((1n << 10n) | (1n << 20n));
});

test('administrator is exactly the one bit, and is never the default', () => {
  expect(BigInt(InvitePermissions.ADMINISTRATOR)).toBe(1n << 3n);
  expect(inviteURL(clientId, InvitePermissions.ADMINISTRATOR)).toContain('permissions=8');
  expect(inviteURL(clientId)).not.toContain('permissions=8');
});

test('both links are offered together so the difference is visible', () => {
  const invites = buildInvites(clientId);
  expect(invites.minimal).toContain('permissions=1049600');
  expect(invites.administrator).toContain('permissions=8');
  expect(invites.minimal).not.toBe(invites.administrator);
});

/** A client_id is a snowflake; anything else would invite some other application. */
test('the client id is carried verbatim and url-encoded', () => {
  const url = new URL(inviteURL('12 34&evil=1'));
  expect(url.searchParams.get('client_id')).toBe('12 34&evil=1');
  expect(url.searchParams.get('evil')).toBeNull();
});
