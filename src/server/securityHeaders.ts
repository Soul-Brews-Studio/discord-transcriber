/**
 * Headers on every response. The CSP is `self`-only with no frame ancestors:
 * this page holds a live control token, so neither an injected script nor an
 * embedding page may reach it.
 */
export function securityHeaders(origins: ReadonlySet<string>): Record<string, string> {
  // The socket origin has to be named. `connect-src 'self'` covers same-origin
  // ws:// in current browsers, but the set is known here and writing it out
  // means a bind that widens does not quietly depend on that reading.
  const sockets = [...origins].map(origin => origin.replace(/^http:/, 'ws:')).join(' ');
  return {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    // `media-src` has to name blob: explicitly. Clip audio is fetched with the
    // control token and played from a blob URL; without this directive the
    // `default-src 'self'` fallback blocks it and the <audio> element fails
    // with NotSupportedError on a src it was never allowed to load.
    // style-src must allow inline: Tailwind's browser build compiles utilities
    // at runtime and installs them through an injected <style>. Under
    // `style-src 'self'` that element lands in the DOM with `sheet === null`
    // and nothing applies — measured, not assumed. The cost is real but bounded:
    // script-src stays 'self', so this permits style injection, not code.
    // The alternative is precompiling Tailwind to a file, which reintroduces a
    // build step for every new class.
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
      + `connect-src 'self' ${sockets}; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'`
  };
}
