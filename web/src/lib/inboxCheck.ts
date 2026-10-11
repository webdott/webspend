import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, MOCK } from '../api/client.ts';

/** A check is skipped when one ran this recently, so switching tabs back and forth stays quiet. */
const FRESH_MS = 30 * 1000;

/**
 * Asks the server to read the inbox now when the dashboard opens and whenever the tab comes back
 * to the front, then refreshes what is on screen if that produced anything. The server's own
 * poll runs every minute regardless; this just shortens the wait after a payment.
 */
export function useInboxCheck(enabled: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled || MOCK) return;
    let last = 0;
    const check = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < FRESH_MS) return;
      last = Date.now();
      api
        .pollInbox()
        .then((result) => {
          if (result.added > 0) void queryClient.invalidateQueries();
        })
        .catch(() => {
          // The regular poll covers it; a failed early check is not worth a message.
        });
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [enabled, queryClient]);
}
