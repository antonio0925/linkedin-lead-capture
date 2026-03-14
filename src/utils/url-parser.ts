import type { LinkedInPageType } from '../shared/types';

export function detectPageType(url: string): LinkedInPageType {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return 'unknown';
  }

  if (/^\/in\/[^/]+/.test(pathname)) return 'profile';
  if (/^\/feed/.test(pathname)) return 'feed';
  if (/^\/search\//.test(pathname)) return 'search';
  if (/^\/company\/[^/]+/.test(pathname)) return 'company';

  return 'unknown';
}

export function extractProfileSlug(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/^\/in\/([^/]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function normalizeLinkedInUrl(url: string): string | null {
  const slug = extractProfileSlug(url);
  if (!slug) return null;
  return `https://www.linkedin.com/in/${slug}/`;
}
