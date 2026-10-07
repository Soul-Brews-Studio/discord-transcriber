/** At most this many points leave the server for one utterance. */
export const TRACE_POINTS = 120;

/**
 * Reduces per-frame probabilities to a drawable trace.
 *
 * Max-pooled, never averaged. The threshold view exists to show which frames
 * cleared the line, and a mean flattens exactly the spikes the gate reacted to
 * — the same mistake `speechVerdict` refuses to make when it counts confident
 * frames instead of averaging them.
 *
 * Rounded to two places: the drawn difference between 0.913 and 0.91 is nothing,
 * and the bytes are sent per utterance over a socket shared with everything else.
 */
export function traceOf(probabilities: readonly number[], points = TRACE_POINTS): number[] {
  if (probabilities.length <= points) return probabilities.map(round);
  const trace: number[] = [];
  for (let i = 0; i < points; i++) {
    const from = Math.floor((i * probabilities.length) / points);
    const to = Math.floor(((i + 1) * probabilities.length) / points);
    let peak = 0;
    for (let j = from; j < to; j++) if (probabilities[j]! > peak) peak = probabilities[j]!;
    trace.push(round(peak));
  }
  return trace;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
