/**
 * Single source of truth for LinkedIn DOM selectors.
 *
 * Rules:
 *  - Use aria-label, data-* attributes, and semantic HTML selectors.
 *  - NEVER rely on obfuscated/hashed class names (e.g. .artdeco-xxx-yyy).
 *  - Arrays are tried in order — first match wins.
 */

export const SELECTORS = {
  // ----- Action buttons (event delegation targets) -----

  connectButton: [
    'button[aria-label*="Invite"][aria-label*="connect" i]',
    'button[aria-label*="Connect with" i]',
    'button[aria-label*="connect" i]',
    // Dropdown menu item variant
    'div[aria-label*="connect" i][role="button"]',
    // Span with Connect text inside a button
    'button.artdeco-button[aria-label*="connect" i]',
  ],

  likeButton: [
    'button[aria-label*="React Like" i]',
    'button[aria-label^="Like" i]',
    'button[aria-label*="react-like" i]',
    // Class-based fallback (LinkedIn's react button trigger)
    'button.react-button__trigger',
    // Reactions toolbar variant
    'button[data-reaction-type="LIKE"]',
  ],

  // Message send button (in messaging panel)
  messageSendButton: [
    'button[aria-label*="Send" i][type="submit"]',
    'form.msg-form button[type="submit"]',
    '.msg-form__send-button',
  ],

  // Comment submit
  commentSubmitButton: [
    'button[aria-label*="Post comment" i]',
    'button[aria-label*="Submit comment" i]',
    'button.comments-comment-box__submit-button',
  ],

  // Repost/Share button
  repostButton: [
    'button[aria-label*="Repost" i]',
    'button[aria-label*="Share" i][data-control-name*="repost"]',
    'li-icon[type="repost-icon"]',
  ],

  // InMail send button
  inmailSendButton: [
    'button[aria-label*="Send InMail" i]',
    'button[aria-label*="Send message" i][data-control-name*="inmail"]',
  ],

  // ----- Messaging panel selectors (for message_sent / inmail_sent) -----

  messagingPanel: {
    participantName: [
      '.msg-conversation-card__participant-names',
      'h2.msg-overlay-bubble-header__title',
      '.msg-thread__link-to-profile',
    ].join(', '),
    profileLink: '.msg-thread__link-to-profile[href*="/in/"], .msg-overlay-bubble-header a[href*="/in/"]',
    participantHeadline: '.msg-conversation-card__subtitle, .msg-overlay-bubble-header__subtitle',
  },

  // ----- Profile page selectors -----

  profilePage: {
    name: 'main h1',
    headline: 'main [data-generated-suggestion-target] ~ div',
    headlineFallback: 'main section .text-body-medium',
    profileImage: [
      'main img[alt*="photo" i]',
      'main img[alt*="profile" i]',
      'main button[aria-label*="photo" i] img',
    ].join(', '),
    location: 'main section .text-body-small:not([data-generated-suggestion-target])',
    connectionDegree: 'main .dist-value, main span.dist-value',
    experienceCompany:
      '#experience ~ .pvs-list__outer-container a[data-field="experience_company_logo"] span[aria-hidden="true"]',
  },

  // ----- Feed / post card selectors -----

  feedCard: {
    // The outermost wrapper that carries the member URN
    actorContainer: '[data-urn*="urn:li:member"], [data-urn*="urn:li:fs_miniProfile"]',
    actorName: [
      'a[data-control-name="actor"] span[aria-hidden="true"]',
      '.update-components-actor__name span[aria-hidden="true"]',
    ].join(', '),
    actorHeadline: '.update-components-actor__description span[aria-hidden="true"]',
    actorLink: 'a[data-control-name="actor"][href*="/in/"], a[href*="/in/"]',
    actorImage: '.update-components-actor__image img, .feed-shared-actor__avatar img',
  },

  // ----- Search results selectors -----

  searchResult: {
    resultCard: '.reusable-search__result-container, [data-chameleon-result-urn]',
    name: 'a[href*="/in/"] span[aria-hidden="true"]',
    headline: '.entity-result__primary-subtitle',
    profileLink: 'a[href*="/in/"]',
    profileImage: '.entity-result__image img',
  },
} as const;
