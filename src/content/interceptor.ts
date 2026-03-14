/**
 * Event delegation interceptor for LinkedIn action buttons.
 *
 * Attaches a single click listener on document.body and checks whether
 * the click target (or a nearby ancestor) matches Connect/Like selectors.
 *
 * IMPORTANT: Never calls preventDefault or stopPropagation — the native
 * LinkedIn action must complete normally.
 */

import type { CaptureAction } from '../shared/types';
import { SELECTORS } from './selectors';

type OnCapture = (action: CaptureAction, element: HTMLElement) => void;

/**
 * Walk up from `target` (max `depth` levels) looking for an element that
 * matches any of the provided CSS selectors.
 */
function findMatchingAncestor(
  target: HTMLElement,
  selectors: readonly string[],
  depth: number,
): HTMLElement | null {
  let el: HTMLElement | null = target;
  for (let i = 0; i <= depth && el; i++) {
    for (const sel of selectors) {
      try {
        if (el.matches(sel)) return el;
      } catch {
        // Invalid selector — skip silently
      }
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Start intercepting Connect/Like clicks via event delegation.
 *
 * @param onCapture  Called when a matching button is clicked.
 * @param isEnabled  Gate function — if it returns false the click is ignored.
 * @returns          Cleanup function that removes the listener.
 */
export function startInterceptor(
  onCapture: OnCapture,
  isEnabled: () => boolean,
): () => void {
  const MAX_ANCESTOR_DEPTH = 8;

  /** Selector groups mapped to their CaptureAction */
  const ACTION_MAP: ReadonlyArray<[CaptureAction, readonly string[]]> = [
    ['connect', SELECTORS.connectButton],
    ['like', SELECTORS.likeButton],
    ['message_sent', SELECTORS.messageSendButton],
    ['comment', SELECTORS.commentSubmitButton],
    ['repost', SELECTORS.repostButton],
    ['inmail_sent', SELECTORS.inmailSendButton],
  ];

  /**
   * Text-based fallback: walk up to find a <button> ancestor, then check its
   * visible text or aria-label for action keywords.
   */
  function matchByText(target: HTMLElement): [CaptureAction, HTMLElement] | null {
    let el: HTMLElement | null = target;
    for (let i = 0; i <= MAX_ANCESTOR_DEPTH && el; i++) {
      if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        const text = (el.textContent || '').trim().toLowerCase();

        // Connect
        if (label.includes('connect') || text === 'connect') {
          return ['connect', el];
        }
        // Like (but not "unlike")
        if ((label.includes('like') && !label.includes('unlike')) ||
            ((text.includes('like') || text.startsWith('react')) && !text.includes('unlike'))) {
          return ['like', el];
        }
        // Message send
        if ((label.includes('send') && (label.includes('message') || el.getAttribute('type') === 'submit')) ||
            el.matches('form.msg-form button[type="submit"], .msg-form__send-button')) {
          return ['message_sent', el];
        }
        // Comment
        if (label.includes('comment') && (label.includes('post') || label.includes('submit'))) {
          return ['comment', el];
        }
        // Repost
        if (label.includes('repost') || text === 'repost') {
          return ['repost', el];
        }
        // InMail
        if (label.includes('inmail') && label.includes('send')) {
          return ['inmail_sent', el];
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  function handleClick(event: MouseEvent): void {
    if (!isEnabled()) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    // Strategy 1: CSS selector matching
    for (const [action, selectors] of ACTION_MAP) {
      const match = findMatchingAncestor(target, selectors, MAX_ANCESTOR_DEPTH);
      if (match) {
        onCapture(action, match);
        return;
      }
    }

    // Strategy 2: text/aria-label fallback
    const textMatch = matchByText(target);
    if (textMatch) {
      onCapture(textMatch[0], textMatch[1]);
    }
  }

  // Capture phase so we see the click before LinkedIn's handlers
  document.body.addEventListener('click', handleClick, { capture: true });

  return () => {
    document.body.removeEventListener('click', handleClick, { capture: true });
  };
}
