/** Removes absolute file paths so logs never leak photo locations or names. */
export function redactPaths(text: string): string {
  return (
    text
      .replace(/file:\/\/\/[^\s'"`)]+/g, '<path>')
      // Quoted absolute paths (Node's usual error format) may contain spaces: redact to the quote.
      .replace(/(['"`])(?:~[\\/]|\/|[A-Za-z]:[\\/]|\\\\)[^'"`\n]*\1/g, '$1<path>$1')
      // Unquoted macOS/Linux paths under common roots.
      .replace(
        /(^|[\s(=:])(?:~|\/(?:Users|Volumes|private|tmp|var|home|mnt|media))\/[^\s'"`)]*/g,
        '$1<path>'
      )
      // Unquoted Windows drive (C:\ or C:/) and UNC (\\server\share) paths.
      .replace(/(^|[\s(=])(?:[A-Za-z]:[\\/]|\\\\)[^\s'"`)]*/g, '$1<path>')
  );
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const stack = error.stack ?? `${error.name}: ${error.message}`;
    return redactPaths(stack);
  }
  return redactPaths(String(error));
}
