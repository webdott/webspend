import { useEffect } from 'react';
import { api, MOCK } from '../api/client.ts';

/** Render's free tier sleeps a service after 15 idle minutes and takes most of a minute to wake. */
const INTERVAL_MS = 10 * 60 * 1000;
/** A ping counts as fresh for this long, so a tab coming back after a short switch stays quiet. */
const FRESH_MS = 9 * 60 * 1000;

/**
 * Pings the server every ten minutes while the dashboard is open and visible, and as soon as
 * the tab comes back to the front after a longer absence, so the server is already awake.
 */
export function useKeepAlive(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || MOCK) return;
    let last = Date.now();
    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last < FRESH_MS) return;
      last = Date.now();
      void api.meta().catch(() => {
        // The next tick tries again; a failed ping is not something to show the user.
      });
    };
    const timer = setInterval(ping, INTERVAL_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [enabled]);
}
