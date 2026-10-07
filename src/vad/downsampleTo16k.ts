/**
 * 48 kHz to 16 kHz — an exact 3:1 decimation, averaging each triple.
 *
 * The three-tap average is a crude low-pass, not a polyphase resampler: it is
 * here to stop aliasing from inventing energy, and it is enough because the
 * output is only ever fed to a speech/not-speech decision. Do not reuse it to
 * produce audio anyone listens to.
 */
export function downsampleTo16k(mono48k: Int16Array): Float32Array {
  const out = new Float32Array(Math.floor(mono48k.length / 3));
  for (let i = 0; i < out.length; i++) {
    const a = mono48k[i * 3] ?? 0;
    const b = mono48k[i * 3 + 1] ?? 0;
    const c = mono48k[i * 3 + 2] ?? 0;
    out[i] = (a + b + c) / 3 / 32768;
  }
  return out;
}
