export { handler } from './server/handler.ts';
export { localSTT } from './server/localSTT.ts';
export { parsePort } from './server/parsePort.ts';

if (import.meta.main) {
  const { main } = await import('./server/main.ts');
  await main();
}
