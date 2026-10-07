import { encodeFrame } from './encodeFrame.ts';
import { sidecarCommand } from './sidecarCommand.ts';
import type { VadMessage, VadProcess } from './types.ts';

/** Model load is slow the first time; a stuck load must not hang the bot. */
const READY_TIMEOUT_MS = 60_000;
/** One frame is 32 ms of audio — a prediction that slow means something is wrong. */
const PREDICT_TIMEOUT_MS = 5_000;

/**
 * Starts the Silero sidecar and speaks its newline-JSON protocol.
 *
 * One process for the whole session: the model costs seconds to load and Silero
 * is stateful across frames, so per-utterance spawning would be both slow and
 * wrong. `reset()` clears that state between utterances.
 *
 * stderr is drained and discarded — torch prints deprecation warnings there and
 * an unread pipe eventually blocks the child.
 */
export async function createVadProcess(scriptPath: string): Promise<VadProcess> {
  const [command, ...args] = sidecarCommand(scriptPath);
  const child = Bun.spawn([command ?? 'uv', ...args], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  void child.stderr.cancel?.();

  const pending = new Map<number, { resolve: (value: number) => void; reject: (error: Error) => void }>();
  // Seeded with no-ops rather than null: assigning inside the executor below
  // narrows a nullable to `never` for the reader, and the guards then look like
  // dead code to the compiler.
  let ready: (backend: string) => void = () => {};
  let readyFailed: (error: Error) => void = () => {};
  let nextId = 1;
  let stopped = false;

  const readyPromise = new Promise<string>((resolve, reject) => { ready = resolve; readyFailed = reject; });

  void (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of child.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line) continue;
        let message: VadMessage;
        try { message = JSON.parse(line) as VadMessage; } catch { continue; }
        if (message.type === 'ready') { ready(message.backend); continue; }
        if (message.type === 'probability') { pending.get(message.id)?.resolve(message.probability); pending.delete(message.id); continue; }
        if (message.type === 'error') {
          const error = new Error(message.error);
          if (message.id === null) readyFailed(error);
          else { pending.get(message.id)?.reject(error); pending.delete(message.id); }
        }
      }
    }
    stopped = true;
    for (const waiter of pending.values()) waiter.reject(new Error('VAD sidecar exited.'));
    pending.clear();
    readyFailed(new Error('VAD sidecar exited before reporting ready.'));
  })();

  const timer = setTimeout(() => readyFailed(new Error('VAD sidecar did not become ready.')), READY_TIMEOUT_MS);
  let backend: string;
  try { backend = await readyPromise; } finally { clearTimeout(timer); }

  const send = (payload: object): void => { child.stdin.write(JSON.stringify(payload) + '\n'); child.stdin.flush(); };

  return {
    backend,
    async predict(frame) {
      if (stopped) throw new Error('VAD sidecar is not running.');
      const id = nextId++;
      const answer = new Promise<number>((resolve, reject) => pending.set(id, { resolve, reject }));
      const expiry = setTimeout(() => {
        pending.get(id)?.reject(new Error('VAD prediction timed out.'));
        pending.delete(id);
      }, PREDICT_TIMEOUT_MS);
      send({ type: 'predict', id, audio: encodeFrame(frame) });
      try { return await answer; } finally { clearTimeout(expiry); }
    },
    async reset() {
      if (stopped) return;
      send({ type: 'reset', id: nextId++ });
    },
    stop() { stopped = true; child.kill(); }
  };
}
