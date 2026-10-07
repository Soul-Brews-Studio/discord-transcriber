import { VAD_FRAME_SAMPLES } from './types.ts';

/** Little-endian float32 base64, which is what the sidecar decodes. */
export function encodeFrame(frame: Float32Array): string {
  if (frame.length !== VAD_FRAME_SAMPLES) {
    throw new RangeError(`frame must hold exactly ${VAD_FRAME_SAMPLES} samples`);
  }
  const bytes = new Uint8Array(VAD_FRAME_SAMPLES * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < VAD_FRAME_SAMPLES; i++) view.setFloat32(i * 4, frame[i] ?? 0, true);
  return Buffer.from(bytes).toString('base64');
}
