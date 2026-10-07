/**
 * Averages Discord's interleaved 48 kHz stereo PCM16 down to mono.
 *
 * Both channels carry the same speaker here, so averaging is a sum with the
 * uncorrelated noise partly cancelled — not a channel being thrown away.
 */
export function stereoToMono(pcm: Buffer): Int16Array {
  const frames = Math.floor(pcm.length / 4);
  const mono = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    const left = pcm.readInt16LE(i * 4);
    const right = pcm.readInt16LE(i * 4 + 2);
    mono[i] = (left + right) >> 1;
  }
  return mono;
}
