/**
 * SPA navigation detection for LinkedIn.
 *
 * LinkedIn is a single-page app — URL changes don't trigger full reloads.
 * This module patches pushState/replaceState and listens for popstate
 * to detect navigation, debounced at 500ms.
 *
 * Returns a cleanup function that restores all originals.
 */

type OnNavigate = (url: string) => void;

export function startSPAObserver(onNavigate: OnNavigate): () => void {
  const DEBOUNCE_MS = 500;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastUrl = window.location.href;

  // Store originals so we can restore them on cleanup
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  function handleNavigation(): void {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        onNavigate(currentUrl);
      }
    }, DEBOUNCE_MS);
  }

  // Patch history methods
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState(...args);
    handleNavigation();
  };

  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    originalReplaceState(...args);
    handleNavigation();
  };

  // Back/forward buttons
  window.addEventListener('popstate', handleNavigation);

  return () => {
    clearTimeout(debounceTimer);
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener('popstate', handleNavigation);
  };
}
