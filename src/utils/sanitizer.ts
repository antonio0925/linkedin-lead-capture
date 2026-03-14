export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

export function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

export function isValidLinkedInUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isLinkedIn =
      parsed.hostname === 'www.linkedin.com' || parsed.hostname === 'linkedin.com';
    const isProfile = /^\/in\/[a-zA-Z0-9\-]+\/?$/.test(parsed.pathname);
    return isLinkedIn && isProfile;
  } catch {
    return false;
  }
}
