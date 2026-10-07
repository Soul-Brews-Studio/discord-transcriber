import type { AutoFollowMode } from '../types.ts';

/**
 * Reads the auto-follow setting.
 *
 * Default is `off`, and the only way to reach `listen` or `transcribe` is to
 * spell it out: following join-only receives nothing, listening decodes other
 * people's audio, and transcribing sends it on to a service. Those are consent
 * decisions, and nobody should make one by leaving a variable unset — which is
 * also why neither has a `1`/`true` spelling to fall into.
 */
export function autoFollowMode(value: string | undefined): AutoFollowMode {
  if (value === 'transcribe') return 'transcribe';
  if (value === 'listen') return 'listen';
  if (value === 'join' || value === '1' || value === 'true') return 'join';
  return 'off';
}
