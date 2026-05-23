import { describe, it, expect } from 'vitest';
import { detectMention, applyMention, parseLeadingMention } from '../mention.js';

describe('detectMention', () => {
  it('returns null when input has no @', () => {
    expect(detectMention('hello world', 11)).toBeNull();
  });

  it('returns the @-token at the cursor when cursor is inside it', () => {
    expect(detectMention('@', 1)).toEqual({ token: '', start: 0, end: 1 });
    expect(detectMention('@Bu', 3)).toEqual({ token: 'Bu', start: 0, end: 3 });
  });

  it('returns null when cursor sits in text before the @', () => {
    expect(detectMention('hi @Bui', 2)).toBeNull();
  });

  it('terminates the token at the next whitespace', () => {
    // cursor positioned just before the trailing space
    expect(detectMention('@Bu ld', 3)).toEqual({ token: 'Bu', start: 0, end: 3 });
  });

  it('handles mid-string @-tokens', () => {
    expect(detectMention('hi @B', 5)).toEqual({ token: 'B', start: 3, end: 5 });
  });
});

describe('applyMention', () => {
  it('replaces the @-token at the cursor with the canonical label + trailing space', () => {
    const input = 'hi @B';
    const out = applyMention(input, 5, 'Builder 1');
    expect(out.text).toBe('hi @Builder 1 ');
    expect(out.cursor).toBe('hi @Builder 1 '.length);
  });

  it('does nothing when no @-token is at the cursor', () => {
    const input = 'no mention here';
    const out = applyMention(input, 15, 'Builder 1');
    expect(out).toEqual({ text: input, cursor: 15 });
  });

  it('preserves text after the mention if present', () => {
    const input = '@Bu later';
    const out = applyMention(input, 3, 'Builder 1');
    expect(out.text).toBe('@Builder 1  later');
  });
});

describe('parseLeadingMention', () => {
  it('parses @<label> body with multi-word label', () => {
    expect(parseLeadingMention('@Builder 1 ship status?', ['Builder 1', 'Coordinator 1'])).toEqual({
      to: 'Builder 1',
      body: 'ship status?',
    });
  });

  it('parses @all body', () => {
    expect(parseLeadingMention('@all standup', ['Builder 1'])).toEqual({ to: '@all', body: 'standup' });
  });

  it('returns null when no leading @', () => {
    expect(parseLeadingMention('hello @Builder 1', ['Builder 1'])).toBeNull();
  });

  it('returns null when @<token> is not a known label', () => {
    expect(parseLeadingMention('@xyz hi', ['Builder 1'])).toBeNull();
  });

  it('prefers the longest matching label', () => {
    // Both "Builder" and "Builder 1" present in roster; @Builder 1 should win
    const labels = ['Builder', 'Builder 1'];
    expect(parseLeadingMention('@Builder 1 hi', labels)).toEqual({ to: 'Builder 1', body: 'hi' });
  });
});
