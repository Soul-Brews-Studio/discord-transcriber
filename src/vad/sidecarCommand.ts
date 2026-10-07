/**
 * How to launch the Silero sidecar.
 *
 * `--offline` is not an optimisation: a voice bot must never pause mid-call to
 * download a package, and a machine without the cached environment should fail
 * loudly at startup rather than silently reach for the network.
 */
export function sidecarCommand(scriptPath: string): string[] {
  return ['uv', 'run', '--offline', '--no-project', '--script', scriptPath];
}
