export interface MentionRange {
  /** The text after the @, up to whitespace or end-of-input. */
  token: string;
  /** Start index of the @. */
  start: number;
  /** End index (exclusive) of the token. */
  end: number;
}

/**
 * Detect an @-token sitting at the cursor. Returns null if the cursor isn't
 * inside an @-token (or if the input has no @ at all).
 */
export function detectMention(input: string, cursor: number): MentionRange | null {
  let start = -1;
  for (let i = cursor - 1; i >= 0; i--) {
    const ch = input[i];
    if (ch === '@') { start = i; break; }
    if (/\s/.test(ch)) return null; // hit whitespace before any @
  }
  if (start === -1) return null;
  // Token ends at the cursor (caller passes cursor==input.length when at end)
  // — but bail out if the cursor is past whitespace.
  let end = cursor;
  for (let i = start + 1; i < cursor; i++) {
    if (/\s/.test(input[i])) { end = i; break; }
  }
  return { token: input.slice(start + 1, end), start, end };
}

export interface ApplyResult {
  text: string;
  cursor: number;
}

/**
 * Replace the @-token at cursor with `@<label> ` (canonical, with trailing space).
 * If no mention is at the cursor, returns the input unchanged.
 */
export function applyMention(input: string, cursor: number, label: string): ApplyResult {
  const m = detectMention(input, cursor);
  if (!m) return { text: input, cursor };
  const before = input.slice(0, m.start);
  const after = input.slice(m.end);
  const replacement = `@${label} `;
  return { text: before + replacement + after, cursor: before.length + replacement.length };
}

/**
 * Parse the leading `@<label> body` form. Returns null if the input doesn't
 * start with @ or the label isn't in `knownLabels` (also accepts `@all`).
 * Resolves the longest matching label so multi-word labels like "Builder 1"
 * win over a prefix like "Builder".
 */
export function parseLeadingMention(
  input: string,
  knownLabels: string[],
): { to: string; body: string } | null {
  if (!input.startsWith('@')) return null;
  const rest = input.slice(1);
  if (rest.startsWith('all') && (rest.length === 3 || /\s/.test(rest[3]))) {
    return { to: '@all', body: rest.slice(3).trimStart() };
  }
  // Try the longest known label first.
  const sorted = [...knownLabels].sort((a, b) => b.length - a.length);
  for (const label of sorted) {
    if (rest === label) return { to: label, body: '' };
    if (rest.startsWith(label) && /\s/.test(rest[label.length])) {
      return { to: label, body: rest.slice(label.length).trimStart() };
    }
  }
  return null;
}
