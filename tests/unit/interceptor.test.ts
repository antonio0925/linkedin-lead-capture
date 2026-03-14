import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startInterceptor } from '../../src/content/interceptor';
import type { CaptureAction } from '../../src/shared/types';

describe('interceptor', () => {
  let onCapture: ReturnType<typeof vi.fn>;
  let isEnabled: ReturnType<typeof vi.fn>;
  let cleanup: () => void;

  beforeEach(() => {
    document.body.innerHTML = '';
    onCapture = vi.fn<(action: CaptureAction, element: HTMLElement) => void>();
    isEnabled = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    cleanup?.();
  });

  function createButton(tag: string, attrs: Record<string, string>, text: string): HTMLElement {
    const btn = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      btn.setAttribute(k, v);
    }
    btn.textContent = text;
    document.body.appendChild(btn);
    return btn;
  }

  it('fires callback on Connect button click', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    const btn = createButton('button', {
      'aria-label': 'Invite John Doe to connect',
      'data-control-name': 'connect',
    }, 'Connect');

    btn.click();

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('connect', btn);
  });

  it('fires callback on Like button click', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    const btn = createButton('button', {
      'aria-label': 'Like Jane Smith\'s post',
    }, 'Like');

    btn.click();

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('like', btn);
  });

  it('fires callback when clicking child of Connect button', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    const btn = createButton('button', {
      'aria-label': 'Invite John Doe to connect',
    }, '');
    const span = document.createElement('span');
    span.textContent = 'Connect';
    btn.appendChild(span);

    span.click();

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('connect', btn);
  });

  it('does NOT fire on random button clicks', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    const btn = createButton('button', {
      'aria-label': 'Message John Doe',
    }, 'Message');

    btn.click();

    expect(onCapture).not.toHaveBeenCalled();
  });

  it('does NOT fire on non-button element clicks', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    const div = document.createElement('div');
    div.textContent = 'Random div';
    document.body.appendChild(div);

    div.click();

    expect(onCapture).not.toHaveBeenCalled();
  });

  it('respects isEnabled returning false', () => {
    isEnabled.mockReturnValue(false);
    cleanup = startInterceptor(onCapture, isEnabled);

    const btn = createButton('button', {
      'aria-label': 'Invite John Doe to connect',
    }, 'Connect');

    btn.click();

    expect(isEnabled).toHaveBeenCalled();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('identifies connect action type correctly', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    createButton('button', {
      'aria-label': 'Connect with Jane Doe',
    }, 'Connect').click();

    expect(onCapture.mock.calls[0][0]).toBe('connect');
  });

  it('identifies like action type correctly', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    createButton('button', {
      'aria-label': 'Like this post',
    }, 'Like').click();

    expect(onCapture.mock.calls[0][0]).toBe('like');
  });

  it('cleanup function removes the listener', () => {
    cleanup = startInterceptor(onCapture, isEnabled);
    cleanup();

    const btn = createButton('button', {
      'aria-label': 'Invite John Doe to connect',
    }, 'Connect');

    btn.click();

    expect(onCapture).not.toHaveBeenCalled();
  });

  it('matches data-reaction-type Like button', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    const btn = createButton('button', {
      'data-reaction-type': 'LIKE',
    }, 'Like');

    btn.click();

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('like', btn);
  });

  it('matches div[role="button"] connect variant', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    const div = createButton('div', {
      'aria-label': 'Connect with Bob',
      'role': 'button',
    }, 'Connect');

    div.click();

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('connect', div);
  });

  // ── New action types ───────────────────────────────────────────────────

  it('fires callback with action=message_sent on message send button click', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    // Matches SELECTORS.messageSendButton: '.msg-form__send-button'
    const btn = createButton('button', {
      'class': 'msg-form__send-button',
      'type': 'submit',
      'aria-label': 'Send message',
    }, 'Send');

    btn.click();

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('message_sent', btn);
  });

  it('fires callback with action=comment on comment submit button click', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    // Matches SELECTORS.commentSubmitButton: 'button[aria-label*="Post comment" i]'
    const btn = createButton('button', {
      'aria-label': 'Post comment',
      'class': 'comments-comment-box__submit-button',
    }, 'Post');

    btn.click();

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('comment', btn);
  });

  it('fires callback with action=repost on repost button click', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    // Matches SELECTORS.repostButton: 'button[aria-label*="Repost" i]'
    const btn = createButton('button', {
      'aria-label': 'Repost this post',
    }, 'Repost');

    btn.click();

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('repost', btn);
  });

  it('fires callback with action=inmail_sent on InMail send button click', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    // Matches SELECTORS.inmailSendButton: 'button[aria-label*="Send InMail" i]'
    const btn = createButton('button', {
      'aria-label': 'Send InMail',
    }, 'Send');

    btn.click();

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('inmail_sent', btn);
  });

  it('correctly distinguishes between all 6 action types', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    // Connect
    createButton('button', {
      'aria-label': 'Invite Alice to connect',
      'data-control-name': 'connect',
    }, 'Connect').click();

    // Like
    createButton('button', {
      'aria-label': 'Like this post',
    }, 'Like').click();

    // Message sent
    createButton('button', {
      'class': 'msg-form__send-button',
      'type': 'submit',
      'aria-label': 'Send message',
    }, 'Send').click();

    // Comment
    createButton('button', {
      'aria-label': 'Post comment',
      'class': 'comments-comment-box__submit-button',
    }, 'Post').click();

    // Repost
    createButton('button', {
      'aria-label': 'Repost this post',
    }, 'Repost').click();

    // InMail sent
    createButton('button', {
      'aria-label': 'Send InMail',
    }, 'Send InMail').click();

    expect(onCapture).toHaveBeenCalledTimes(6);

    const actions = onCapture.mock.calls.map((call: [CaptureAction, HTMLElement]) => call[0]);
    expect(actions).toEqual([
      'connect',
      'like',
      'message_sent',
      'comment',
      'repost',
      'inmail_sent',
    ]);
  });

  it('fires message_sent via form submit button selector', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    // Build a form.msg-form with a submit button inside
    const form = document.createElement('form');
    form.className = 'msg-form';
    const btn = document.createElement('button');
    btn.setAttribute('type', 'submit');
    btn.textContent = 'Send';
    form.appendChild(btn);
    document.body.appendChild(form);

    btn.click();

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('message_sent', btn);
  });

  it('fires comment via class-based selector', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    // Matches 'button.comments-comment-box__submit-button'
    const btn = createButton('button', {
      'class': 'comments-comment-box__submit-button',
    }, 'Post');

    btn.click();

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('comment', btn);
  });

  it('fires inmail_sent via data-control-name variant', () => {
    cleanup = startInterceptor(onCapture, isEnabled);

    // Matches 'button[aria-label*="Send message" i][data-control-name*="inmail"]'
    const btn = createButton('button', {
      'aria-label': 'Send message',
      'data-control-name': 'inmail_send',
    }, 'Send');

    btn.click();

    expect(onCapture).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith('inmail_sent', btn);
  });
});
