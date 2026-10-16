// What we remember about a file's bytes so saving writes them back the same way.
// Slate normalises text to LF and ensures a trailing newline; these undo that.

export interface FileFormat {
  eol: '\n' | '\r\n';
  trailingNewline: boolean;
  hasBom: boolean;
}

export const NEW_FILE_FORMAT: FileFormat = { eol: '\r\n', trailingNewline: true, hasBom: false };

export function detectFormat(text: string, hasBom: boolean): FileFormat {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length - crlf;
  return {
    eol: crlf > lf ? '\r\n' : (lf === 0 && crlf === 0 ? NEW_FILE_FORMAT.eol : '\n'),
    trailingNewline: text === '' || /\n$/.test(text),
    hasBom,
  };
}

/** Converts Slate's Markdown back into the file's original line-ending style. */
export function toFileText(markdown: string, format: FileFormat): string {
  let text = markdown;
  if (!format.trailingNewline && text.endsWith('\n')) text = text.slice(0, -1);
  return format.eol === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text;
}
