// Storage names preserve Unicode, punctuation and case. Local platform limits
// are checked by the native backend; mtsync reports remote names it cannot use.
export function storageNameProblem(name: string): string | null {
  if (!name) return 'A name is needed.';
  // eslint-disable-next-line no-control-regex
  if (/[\/\\\u0000-\u001f\u007f-\u009f]/.test(name)) return 'Names cannot contain slashes, backslashes or control characters.';
  if ([...name].some(c => c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff)) return 'Names must contain valid Unicode characters.';
  const alias = name.toLowerCase().replace(/[. ]+$/, '');
  if (!alias || alias === '.git') return 'That name is reserved.';
  return null;
}

export function storagePathProblem(relative: string): string | null {
  if (new TextEncoder().encode(relative).length > 240) return 'The path is longer than 240 UTF-8 bytes.';
  const segments = relative.split('/');
  if (segments.length > 8) return 'Spaces allow at most 8 path segments.';
  const root = segments[0].toLowerCase().replace(/[. ]+$/, '');
  if (root === '.metatrash' || root === '.mtsync') return 'That path is reserved for Metatrash metadata.';
  for (const segment of segments) {
    const problem = storageNameProblem(segment);
    if (problem) return problem;
  }
  return null;
}
