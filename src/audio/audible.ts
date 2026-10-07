/**
 * Whether a buffer is worth a transcription request. Too short or too quiet is
 * dropped locally rather than spent on the service.
 */
export function audible(pcm: Buffer): boolean {
  if (pcm.length < 48000 * 4 * 0.4) return false;
  let energy = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) energy += (pcm.readInt16LE(i) / 32768) ** 2;
  return Math.sqrt(energy / (pcm.length / 2)) >= 0.001;
}
