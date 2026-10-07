import { existsSync } from 'node:fs';

/**
 * Where the Silero sidecar lives.
 *
 * It ships in `vad/torch_vad.py`. `VAD_SCRIPT` overrides it.
 */
export function scriptPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env.VAD_SCRIPT;
  if (override) return existsSync(override) ? override : null;
  const shared = new URL('../../vad/torch_vad.py', import.meta.url).pathname;
  return existsSync(shared) ? shared : null;
}
