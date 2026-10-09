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

export function startPoller(db: Db, config: Config, options: PollerOptions = {}): () => void {
  const mailboxFor =
    options.mailboxFor ??
    ((userId: string) =>
      new GmailSource(db, userId, {
        clientId: config.googleClientId!,
        clientSecret: config.googleClientSecret!,
      }));
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await pollAll(db, mailboxFor, config, options.rateSource ?? null);
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
  config: Pick<Config, 'feeThresholdMinor'>,
  rateSource: RateSource | null,
): Promise<void> {
  for (const user of await listPollableUsers(db)) {
    try {
      await pollUser(db, user, mailboxFor(user.id), config, rateSource);
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

async function pollUser(
  db: Db,
  user: User,
  mailbox: MailboxSource,
  config: Pick<Config, 'feeThresholdMinor'>,
  rateSource: RateSource | null,
): Promise<void> {
  const userId = user.id;
  const [earliest] = await db.query<{ tracking_from: unknown }>(
    'select min(tracking_from) as tracking_from from accounts where user_id = $1 and tracked',
    [userId],
  );
  const after = isoOrNull(earliest?.tracking_from);
  if (!after) return;

  const ids = await mailbox.listMessageIds({ senders: [...ALERT_SENDERS], after: new Date(after) });
  const seen = await seenMessageIds(db, userId, ids);
  for (const id of ids) {
    if (seen.has(id)) continue;
    const message = await mailbox.fetchMessage(id);
    await processAlertEmail(
      db,
      user,
      { userId, ...message },
      { rateSource, feeThresholdMinor: config.feeThresholdMinor },
    );
  }
}
