import type { EmitRow, ReceiveOptions, RowBody, TranscriptRow } from '../types.ts';
import { applyPacket } from './applyPacket.ts';
import { enqueueUtterance } from './enqueueUtterance.ts';
import { speakerName } from './speakerName.ts';
import type { AdapterState, OpusScriptConstructor, VoiceConnectionLike } from './types.ts';

/** Bounds concurrent decoders — one per speaker, and a room can be crowded. */
const CAPTURE_LIMIT = 8;
/** Silence that ends an utterance. */
const SILENCE_MS = 800;
/** Sustained speech is cut here so one long turn still produces rows. */
const CHUNK_BYTES = 48000 * 4 * 15;

/**
 * Subscribes to one speaker and measures what arrives.
 *
 * Listen-only measures the PCM and drops it immediately: no buffer is kept, no
 * WAV is built and no request is made. Only `transcribe` accumulates.
 *
 * A capture belongs to one generation. Every callback re-checks it, so audio
 * from a channel the bot has left cannot reach a row or the queue.
 */
export function captureSpeaker(
  adapter: AdapterState,
  connection: VoiceConnectionLike,
  options: ReceiveOptions,
  OpusScript: OpusScriptConstructor,
  generation: number,
  userId: string
): void {
  const { listenUserId = null, transcribe = false, sttURL = '', onRow } = options;
  const client = adapter.client;
  if (!client) return;
  if (generation !== adapter.generation) return;
  if (listenUserId && userId !== listenUserId) return;
  if (adapter.captures.has(userId) || adapter.captures.size >= CAPTURE_LIMIT) return;
  if (client.users.cache.get(userId)?.bot) return;

  const speaker = speakerName(client, userId);
  const row: EmitRow = (body: RowBody) => {
    const entry: TranscriptRow = { id: crypto.randomUUID(), at: new Date().toISOString(), speaker, ...body };
    onRow(entry);
  };

  let decoder: InstanceType<OpusScriptConstructor> | undefined;
  let stream;
  try {
    decoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
    stream = connection.receiver.subscribe(userId, {
      end: { behavior: adapter.lib?.EndBehaviorType.AfterSilence, duration: SILENCE_MS }
    });
  } catch {
    decoder?.delete();
    row({ status: 'error', text: 'Audio receiver initialization failed.' });
    return;
  }

  // Listen-only discards PCM — unless clips were asked for, which is exactly
  // what KEEP_CLIPS means. Without this the timeline is empty in the one mode
  // where reviewing the gate matters most.
  const keepAudio = transcribe || adapter.clipStore.limit > 0;

  let chunks: Buffer[] = [];
  let bytes = 0;
  let closed = false;

  const flush = (): void => {
    if (!bytes) return;
    const pcm = Buffer.concat(chunks, bytes);
    chunks = []; bytes = 0;
    enqueueUtterance(adapter, pcm, generation, sttURL, row, speaker, transcribe);
  };

  const close = (save = false): void => {
    if (closed) return;
    closed = true;
    if (save && keepAudio) flush();
    chunks = []; bytes = 0;
    adapter.captures.delete(userId);
    if (!adapter.captures.size) adapter.audio.rms = 0;
    stream.destroy();
    decoder?.delete();
  };

  adapter.captures.set(userId, close);

  stream.on('data', (packet: Buffer) => {
    if (closed || generation !== adapter.generation) return;
    adapter.audio.packets++;
    let pcm: Buffer;
    try {
      pcm = Buffer.from(decoder!.decode(packet));
    } catch {
      adapter.audio.decodeErrors++;
      row({ status: 'error', text: 'Invalid Opus packet; utterance discarded.' });
      close();
      return;
    }
    if (!pcm.length) return;
    applyPacket(adapter, pcm, speaker);
    if (!keepAudio) return;           // listen-only with clips off: measured, then dropped
    chunks.push(pcm);
    bytes += pcm.length;
    if (bytes >= CHUNK_BYTES) flush();
  });
  stream.once('end', () => close(true));
  stream.once('error', () => {
    if (!closed) row({ status: 'error', text: 'Audio receiver error; utterance discarded.' });
    close();
  });
  stream.once('close', () => close());
}
