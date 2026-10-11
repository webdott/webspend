/**
 * Watches each signed-in user's mailbox for new bank alerts. Only mail from the registered
 * senders and after the earliest `tracking_from` is listed; the past is never read.
 */
import type { User } from '@webspend/shared';
import { ALERT_SENDERS } from '../alerts/index.ts';
import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import { isoOrNull } from '../db/rows.ts';
import { listPollableUsers } from '../ledger/users.ts';
import type { RateSource } from '../rates/source.ts';
import { GmailSource } from './gmail.ts';
import type { MailboxSource } from './mailbox.ts';
import { processAlertEmail, seenMessageIds } from './pipeline.ts';

export type PollerOptions = {
  rateSource?: RateSource | null;
  mailboxFor?: (userId: string) => MailboxSource;
};

function gmailFor(db: Db, config: Config): (userId: string) => MailboxSource {
  return (userId) =>
    new GmailSource(db, userId, {
      clientId: config.googleClientId!,
      clientSecret: config.googleClientSecret!,
    });
}

// Users whose inbox is being read right now, so a refresh tapped twice does not read it twice.
const inFlight = new Set<string>();
const lastPolledAt = new Map<string, number>();
const POLL_NOW_COOLDOWN_MS = 10_000;

/**
 * Reads one user's inbox now, ahead of the regular poll, for a refresh in an app. Skipped when
 * Google is not configured, the user has no mailbox, or a check ran in the last few seconds.
 */
export async function pollNow(
  db: Db,
  config: Config,
  user: User,
  options: PollerOptions = {},
): Promise<{ polled: boolean; added: number }> {
  if (!config.googleConfigured && !options.mailboxFor) return { polled: false, added: 0 };
  const [token] = await db.query('select 1 from mailbox_tokens where user_id = $1', [user.id]);
  if (!token) return { polled: false, added: 0 };
  const last = lastPolledAt.get(user.id) ?? 0;
  if (inFlight.has(user.id) || Date.now() - last < POLL_NOW_COOLDOWN_MS) {
    return { polled: false, added: 0 };
  }
  inFlight.add(user.id);
  try {
    const mailboxFor = options.mailboxFor ?? gmailFor(db, config);
    const added = await pollUser(db, user, mailboxFor(user.id), options.rateSource ?? null);
    lastPolledAt.set(user.id, Date.now());
    return { polled: true, added };
  } finally {
    inFlight.delete(user.id);
  }
}

export function startPoller(db: Db, config: Config, options: PollerOptions = {}): () => void {
  const mailboxFor = options.mailboxFor ?? gmailFor(db, config);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await pollAll(db, mailboxFor, options.rateSource ?? null);
    } catch (error) {
      console.error('poller:', error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, config.pollIntervalSeconds * 1000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

export async function pollAll(
  db: Db,
  mailboxFor: (userId: string) => MailboxSource,
  rateSource: RateSource | null,
): Promise<void> {
  for (const user of await listPollableUsers(db)) {
    try {
      await pollUser(db, user, mailboxFor(user.id), rateSource);
      await db.query(
        'update mailbox_tokens set last_polled_at = now(), last_error = null where user_id = $1',
        [user.id],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`poller: ${user.email}: ${message}`);
      await db.query(
        'update mailbox_tokens set last_polled_at = now(), last_error = $2 where user_id = $1',
        [user.id, message.slice(0, 1000)],
      );
    }
  }
}

/** Reads what is new in one inbox and returns how many transactions that produced. */
async function pollUser(
  db: Db,
  user: User,
  mailbox: MailboxSource,
  rateSource: RateSource | null,
): Promise<number> {
  const userId = user.id;
  const [earliest] = await db.query<{ tracking_from: unknown }>(
    'select min(tracking_from) as tracking_from from accounts where user_id = $1 and tracked',
    [userId],
  );
  const after = isoOrNull(earliest?.tracking_from);
  if (!after) return 0;

  const ids = await mailbox.listMessageIds({ senders: [...ALERT_SENDERS], after: new Date(after) });
  const seen = await seenMessageIds(db, userId, ids);
  let added = 0;
  for (const id of ids) {
    if (seen.has(id)) continue;
    const message = await mailbox.fetchMessage(id);
    const alert = await processAlertEmail(db, user, { userId, ...message }, { rateSource });
    if (alert.status === 'parsed') added += 1;
  }
  return added;
}
