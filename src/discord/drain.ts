import type { AdapterState } from './types.ts';

/** A stalled service must not hold the queue forever. */
const STT_TIMEOUT_MS = 20000;
/** Transcripts are displayed, not stored; an unbounded body has no use here. */
const TEXT_LIMIT = 12000;

/**
 * Sends queued audio to the local MLX service, one request at a time.
 *
 * Serial by design: the queue exists to bound concurrency, and the generation
 * check drops work belonging to a join that has since been left, so a late
 * reply never appears under a channel the bot is no longer in.
 */
export async function drain(adapter: AdapterState): Promise<void> {
  if (adapter.activeRequest) return;
  const item = adapter.queue.shift();
  if (!item) return;
  if (item.generation !== adapter.generation) return adapter.drain();

  console.log(`[stt] posting ${item.wav.length} bytes to ${item.sttURL || '(no url!)'} `
    + `gen=${item.generation} current=${adapter.generation}`);
  const abort = new AbortController();
  adapter.activeRequest = abort;
  const timer = setTimeout(() => abort.abort(), STT_TIMEOUT_MS);
  try {
    const response = await fetch(`${item.sttURL}/transcribe`, {
      method: 'POST', body: item.wav, headers: { 'Content-Type': 'audio/wav' },
      signal: abort.signal, redirect: 'error'
    });
    if (!response.ok) throw new Error('STT request failed');
    const data = await response.json() as { text?: unknown };
    if (typeof data.text !== 'string') throw new Error('Invalid STT response');
    const text = data.text.slice(0, TEXT_LIMIT).trim();
    // An empty result is a success — the service heard no words — but it is not
    // a transcript row. A row with a speaker, a timestamp and nothing said
    // records nothing and pushes what was said off the screen. The gate's
    // verdict on that audio is already in the clip timeline, which is where
    // "passed the gate, held no speech" belongs.
    console.log(`[stt] got ${JSON.stringify(text).slice(0, 60)} `
      + `gen=${item.generation} current=${adapter.generation} `
      + `${text ? '' : '(empty → no row)'}${item.generation === adapter.generation ? '' : '(stale → dropped)'}`);
    if (text && item.generation === adapter.generation) item.row({ status: 'final', text });
  } catch (error) {
    console.log(`[stt] failed: ${(error as Error).message} gen=${item.generation} current=${adapter.generation}`);
    if (item.generation === adapter.generation) item.row({ status: 'error', text: 'MLX transcription failed; check the local service.' });
  } finally {
    clearTimeout(timer);
    adapter.activeRequest = null;
    void adapter.drain();
  }
}
