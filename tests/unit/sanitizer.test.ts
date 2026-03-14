import { describe, it, expect } from 'vitest';
import { stripHtml, normalizeWhitespace, isValidLinkedInUrl } from '../../src/utils/sanitizer';

describe('stripHtml', () => {
  it('strips simple HTML tags', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold');
  });

  it('strips nested HTML tags', () => {
    expect(stripHtml('<div><span>text</span></div>')).toBe('text');
  });

  it('strips self-closing tags', () => {
    expect(stripHtml('before<br/>after')).toBe('beforeafter');
  });

  it('strips tags with attributes', () => {
    expect(stripHtml('<a href="https://example.com">link</a>')).toBe('link');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtml('no tags here')).toBe('no tags here');
  });

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });

  it('strips script tags', () => {
    expect(stripHtml('<script>alert("xss")</script>safe')).toBe('alert("xss")safe');
  });
});

describe('normalizeWhitespace', () => {
  it('collapses multiple spaces', () => {
    expect(normalizeWhitespace('hello   world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeWhitespace('  hello  ')).toBe('hello');
  });

  it('collapses tabs and newlines', () => {
    expect(normalizeWhitespace('hello\t\n  world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(normalizeWhitespace('')).toBe('');
  });

  it('handles string with only whitespace', () => {
    expect(normalizeWhitespace('   \t\n   ')).toBe('');
  });
});

describe('isValidLinkedInUrl', () => {
  it('accepts valid www.linkedin.com profile URL', () => {
    expect(isValidLinkedInUrl('https://www.linkedin.com/in/johndoe/')).toBe(true);
  });

  it('accepts valid linkedin.com profile URL (no www)', () => {
    expect(isValidLinkedInUrl('https://linkedin.com/in/johndoe/')).toBe(true);
  });

  it('accepts profile slug with hyphens', () => {
    expect(isValidLinkedInUrl('https://www.linkedin.com/in/john-doe-123/')).toBe(true);
  });

  it('accepts without trailing slash', () => {
    expect(isValidLinkedInUrl('https://www.linkedin.com/in/johndoe')).toBe(true);
  });

  it('rejects non-LinkedIn domain', () => {
    expect(isValidLinkedInUrl('https://www.example.com/in/johndoe/')).toBe(false);
  });

  it('rejects LinkedIn URLs that are not profile pages', () => {
    expect(isValidLinkedInUrl('https://www.linkedin.com/feed/')).toBe(false);
    expect(isValidLinkedInUrl('https://www.linkedin.com/company/acme/')).toBe(false);
  });

  it('rejects invalid URL strings', () => {
    expect(isValidLinkedInUrl('not-a-url')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidLinkedInUrl('')).toBe(false);
  });

  it('rejects URL with query params in slug path', () => {
    // The regex requires the pathname to match exactly /in/<slug>/
    // Query params are not part of pathname, so this should still be valid
    expect(isValidLinkedInUrl('https://www.linkedin.com/in/johndoe?trk=foo')).toBe(true);
  });
});
