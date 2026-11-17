// Shared validation helpers used by every platform adapter.
export const countHashtags = (s = '') => (String(s).match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
export const countMentions = (s = '') => (String(s).match(/(^|\s)@[\w.]+/g) || []).length;
export const utf16Len = (s = '') => String(s).length;
export const byteLen = (s = '') => Buffer.byteLength(String(s), 'utf8');
export const isVertical = (m) => m.width && m.height && m.height / m.width >= 1.2;
export const ratio = (m) => (m.width && m.height ? m.width / m.height : null);
export const fmtDur = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);

export function result() {
  const r = { errors: [], warnings: [] };
  r.err = (m) => r.errors.push(m);
  r.warn = (m) => r.warnings.push(m);
  return r;
}

/** First non-empty line of a caption, trimmed to n chars — used as a fallback title. */
export function firstLine(s = '', n = 100) {
  const line = String(s).split('\n').map((l) => l.trim()).find(Boolean) || '';
  return line.length > n ? `${line.slice(0, n - 1).trimEnd()}…` : line;
}
