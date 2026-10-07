/**
 * The control token: fixed if one was configured, fresh otherwise.
 *
 * A per-process token is the safer default — a link stops working the moment
 * the server stops, so a URL left in a chat log expires on its own. It is also
 * why every restart hands out a new address, which is an actively bad trade for
 * a bookmark on a phone.
 *
 * `CONTROL_TOKEN` buys a link that survives a restart, and it must be paid for
 * honestly: that token is now a long-lived credential for connecting the bot,
 * decoding a voice channel and moving a member between rooms. Short values are
 * refused rather than accepted with a warning nobody reads — a guessable token
 * on an address reachable across a mesh is not a smaller version of a secret.
 */
export const MIN_TOKEN_LENGTH = 32;

export function controlToken(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CONTROL_TOKEN?.trim();
  if (!configured) return crypto.randomUUID();
  if (configured.length < MIN_TOKEN_LENGTH) {
    throw new Error(`CONTROL_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters; `
      + 'generate one with `openssl rand -hex 24`.');
  }
  return configured;
}
