/** Electron wraps IPC errors as "Error invoking remote method 'x': Error: <message>". */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}
