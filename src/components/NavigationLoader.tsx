'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LoadingScreen } from '@/components/LoadingScreen';

/**
 * The loading screen, from the moment of the click.
 *
 * Each route's loading.tsx only appears once Next.js has something to show for
 * the new route. In production that is near-instant, because links prefetch
 * their loading state; in development nothing prefetches, and a click could
 * sit on the old page with no sign it had registered. The rule this enforces
 * is simpler than either: something was clicked, so the loading screen is up
 * until the next page is.
 *
 * It clears when the pathname changes. That happens as soon as the new route
 * commits — to its own loading.tsx if it has one, which is the same screen, or
 * straight to the page — so the hand-off is invisible.
 *
 * Buttons that navigate after an API call (starting or joining a table) raise
 * it themselves with `showPageLoading()` at the click, before the request, and
 * lower it with `hidePageLoading()` if the request fails.
 */

const SHOW = 'dehel:page-loading-show';
const HIDE = 'dehel:page-loading-hide';

/**
 * A navigation that never changes the pathname — a redirect back to the page
 * you are on, or a failed request — would otherwise leave the screen up for
 * good. Long enough never to cut off a real load, short enough to recover.
 */
const GIVE_UP_AFTER_MS = 15_000;

/** Raise the loading screen now, ahead of a navigation the caller is about to make. */
export function showPageLoading() {
  window.dispatchEvent(new Event(SHOW));
}

/** Lower it again when that navigation is not going to happen after all. */
export function hidePageLoading() {
  window.dispatchEvent(new Event(HIDE));
}

/**
 * Whether a click on this element is about to load another page of this app.
 * Anything that opens elsewhere, downloads, or stays on this page is not.
 */
function leadsToAnotherPage(event: MouseEvent): boolean {
  // Only a plain left click navigates in place; the rest open new tabs.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  const anchor = (event.target as Element | null)?.closest?.('a');
  if (!anchor || !anchor.href) return false;
  if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  // Same path — a hash, a query change, or the page you are already on (the
  // lit pill in the header). Nothing is going to load, and with no pathname
  // change to clear it the screen would only hang.
  return url.pathname !== window.location.pathname;
}

export function NavigationLoader() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  // The route changed, so whatever was loading has arrived.
  useEffect(() => {
    setVisible(false);
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (leadsToAnotherPage(event)) setVisible(true);
    }
    const show = () => setVisible(true);
    const hide = () => setVisible(false);

    // Capture phase: next/link calls preventDefault to navigate client-side,
    // so a listener that ran after it could not tell a navigation from a click
    // that was cancelled on purpose.
    document.addEventListener('click', onClick, true);
    window.addEventListener(SHOW, show);
    window.addEventListener(HIDE, hide);
    window.addEventListener('popstate', hide);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(SHOW, show);
      window.removeEventListener(HIDE, hide);
      window.removeEventListener('popstate', hide);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), GIVE_UP_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  // Above every modal (z-50), so nothing on the old page can be clicked twice.
  return (
    <div className="fixed inset-0 z-[100]">
      <LoadingScreen />
    </div>
  );
}
