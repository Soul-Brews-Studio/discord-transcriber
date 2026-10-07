/** Above this the buffer is measured in hundreds of megabytes of held voice. */
const MAX_CLIPS = 200;

/**
 * Reads `KEEP_CLIPS`. Absent, zero, or unparsable means keep nothing.
 *
 * 48 kHz stereo PCM16 is 192 KB per second, so the cap is a memory bound as
 * much as a privacy one: 200 clips of five seconds is roughly 190 MB resident.
 */
export function clipLimit(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(Math.floor(parsed), MAX_CLIPS);
}
