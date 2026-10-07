import { speakerName } from './speakerName.ts';
import type { AdapterState } from './types.ts';

/**
 * Who is talking right now, by display name.
 *
 * Distinct from `audio.speaker`, which is whoever was decoded last and stays
 * put once the room goes quiet. This empties when everyone stops.
 */
export function speakingNow(adapter: AdapterState): string[] {
  const client = adapter.client;
  if (!client) return [];
  return [...adapter.speaking].map(id => speakerName(client, id));
}
