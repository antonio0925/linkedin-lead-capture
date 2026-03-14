import { describe, it, expect } from 'vitest';
import { detectPageType, extractProfileSlug, normalizeLinkedInUrl } from '../../src/utils/url-parser';

describe('detectPageType', () => {
  it('detects /in/ as profile', () => {
    expect(detectPageType('https://www.linkedin.com/in/johndoe/')).toBe('profile');
    expect(detectPageType('https://www.linkedin.com/in/jane-doe')).toBe('profile');
  });

  it('detects /feed as feed', () => {
    expect(detectPageType('https://www.linkedin.com/feed/')).toBe('feed');
    expect(detectPageType('https://www.linkedin.com/feed')).toBe('feed');
  });

  it('detects /search as search', () => {
    expect(detectPageType('https://www.linkedin.com/search/results/people/?keywords=cto')).toBe('search');
  });

  it('detects /company/ as company', () => {
    expect(detectPageType('https://www.linkedin.com/company/acme-corp/')).toBe('company');
  });

  it('returns unknown for /messaging', () => {
    expect(detectPageType('https://www.linkedin.com/messaging/thread/123')).toBe('unknown');
  });

  it('returns unknown for /jobs', () => {
    expect(detectPageType('https://www.linkedin.com/jobs/')).toBe('unknown');
  });

  it('returns unknown for invalid URL', () => {
    expect(detectPageType('not-a-url')).toBe('unknown');
  });

  it('returns unknown for empty string', () => {
    expect(detectPageType('')).toBe('unknown');
  });
});

describe('extractProfileSlug', () => {
  it('extracts slug from profile URL', () => {
    expect(extractProfileSlug('https://www.linkedin.com/in/johndoe/')).toBe('johndoe');
  });

  it('extracts slug without trailing slash', () => {
    expect(extractProfileSlug('https://www.linkedin.com/in/jane-doe')).toBe('jane-doe');
  });

  it('extracts slug with query params', () => {
    expect(extractProfileSlug('https://www.linkedin.com/in/johndoe?trk=abc')).toBe('johndoe');
  });

  it('returns null for non-profile URL', () => {
    expect(extractProfileSlug('https://www.linkedin.com/feed/')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(extractProfileSlug('not-a-url')).toBeNull();
  });
});

describe('normalizeLinkedInUrl', () => {
  it('normalizes a standard profile URL', () => {
    expect(normalizeLinkedInUrl('https://www.linkedin.com/in/johndoe/')).toBe(
      'https://www.linkedin.com/in/johndoe/',
    );
  });

  it('adds trailing slash if missing', () => {
    expect(normalizeLinkedInUrl('https://www.linkedin.com/in/johndoe')).toBe(
      'https://www.linkedin.com/in/johndoe/',
    );
  });

  it('strips query params and hash', () => {
    expect(normalizeLinkedInUrl('https://www.linkedin.com/in/johndoe?trk=abc#section')).toBe(
      'https://www.linkedin.com/in/johndoe/',
    );
  });

  it('returns null for non-profile URL', () => {
    expect(normalizeLinkedInUrl('https://www.linkedin.com/feed/')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(normalizeLinkedInUrl('not-a-url')).toBeNull();
  });
});
