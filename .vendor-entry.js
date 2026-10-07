// One-time vendoring entry — see `bun run vendor`. React 19 ships no UMD build,
// so the browser bundle is produced once and committed. There is no build step
// in the edit loop: change public/app.js and reload.
export { createElement, useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
export { createRoot } from 'react-dom/client';
export { default as htm } from 'htm';
