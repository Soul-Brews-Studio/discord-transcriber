/** Control bodies are a handful of IDs; anything larger is refused unread. */
const BODY_LIMIT = 2048;

/**
 * Parses a control request body as a plain JSON object.
 *
 * Both the declared length and the actual text are checked, because
 * `Content-Length` is client-supplied and may understate the body.
 */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length') ?? 0) > BODY_LIMIT) throw new RangeError('Request too large.');
  const text = await request.text();
  if (text.length > BODY_LIMIT) throw new RangeError('Request too large.');
  const parsed: unknown = JSON.parse(text || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('Invalid JSON.');
  return parsed as Record<string, unknown>;
}
