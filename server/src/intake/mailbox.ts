/**
 * What intake needs from a mailbox. Gmail implements it today; a forwarding address, IMAP or a
 * bank-data provider can replace it without touching the pipeline or the rules.
 */
export type MailboxMessage = {
  messageId: string;
  from: string;
  subject: string;
  text: string;
  receivedAt: string;
  /** The message passed sender authentication (SPF and DKIM, or ARC). */
  authenticated: boolean;
};

export interface MailboxSource {
  listMessageIds(opts: { senders: string[]; after: Date }): Promise<string[]>;
  fetchMessage(id: string): Promise<MailboxMessage>;
}
