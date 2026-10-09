import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAlert } from '../alerts/index.ts';
import { htmlToText } from './html.ts';
import { isAuthenticated, messageFromPayload } from './gmail.ts';

test('a GTBank table alert reads like the sample after conversion', () => {
  const html = `<html><head><style>td{padding:2px}</style></head><body>
    <p>Dear SAMPLE, TEST USER</p>
    <p>We wish to inform you that a DEBIT transaction occurred on your account with us.</p>
    <table>
      <tr><td>Account Number</td><td>:</td><td>******0001</td></tr>
      <tr><td>Description</td><td>:</td><td>WEB PUR SAMPLE CLOUD A1B2C3 CC SAMPLE COM IE 000001 600000000001 WPGTID01</td></tr>
      <tr><td>Amount</td><td>:</td><td>NGN 6685</td></tr>
      <tr><td>Value Date</td><td>:</td><td>2026-10-03</td></tr>
      <tr><td>Time of Transaction</td><td>:</td><td>8:36:47 PM</td></tr>
      <tr><td>Document Number</td><td>:</td><td>000001</td></tr>
      <tr><td>Current Balance</td><td>:</td><td>NGN 83724.49</td></tr>
    </table></body></html>`;
  const text = htmlToText(html);
  assert.match(text, /^\| Account Number \| : \| \*{6}0001 \|$/m);
  assert.match(text, /^\| Amount \| : \| NGN 6685 \|$/m);
  const result = parseAlert({ from: 'GeNS@gtbank.com', subject: 'Transaction Notification', text });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.alert.amountMinor, 668_500);
  assert.equal(result.alert.balanceAfterMinor, 8_372_449);
  assert.equal(result.alert.occurredAt, '2026-10-03T20:36:47+01:00');
});

test('entities decode and block tags become line breaks', () => {
  const text = htmlToText(
    '<div>Your payment of<br>&#8358;2,413.00 &amp; more</div><p>Tom &quot;T&quot; &nbsp;Jones</p><ul><li>one</li><li>two</li></ul>',
  );
  assert.equal(text, 'Your payment of\n₦2,413.00 & more\n\nTom "T" Jones\n\none\ntwo');
});

test('a Gmail payload yields the text part, the headers and the authentication verdict', () => {
  const encode = (s: string) => Buffer.from(s).toString('base64url');
  const message = messageFromPayload({
    id: 'abc',
    internalDate: '1759950000000',
    payload: {
      mimeType: 'multipart/alternative',
      headers: [
        { name: 'From', value: 'OPay <no-reply@opay-nigeria.com>' },
        { name: 'Subject', value: 'Payment Successful' },
        {
          name: 'Authentication-Results',
          value: 'mx.google.com; dkim=pass header.i=@opay-nigeria.com; spf=pass',
        },
      ],
      parts: [
        { mimeType: 'text/plain', body: { data: encode('plain body') } },
        { mimeType: 'text/html', body: { data: encode('<p>html body</p>') } },
      ],
    },
  });
  assert.equal(message.messageId, 'abc');
  assert.equal(message.from, 'OPay <no-reply@opay-nigeria.com>');
  assert.equal(message.subject, 'Payment Successful');
  assert.equal(message.text, 'plain body');
  assert.equal(message.receivedAt, new Date(1759950000000).toISOString());
  assert.equal(message.authenticated, true);

  const htmlOnly = messageFromPayload({
    id: 'x',
    payload: { mimeType: 'text/html', body: { data: encode('<p>only html</p>') }, headers: [] },
  });
  assert.equal(htmlOnly.text, 'only html');
  assert.equal(htmlOnly.authenticated, false);
  assert.equal(isAuthenticated('arc=pass (i=1)'), true);
  assert.equal(isAuthenticated('dkim=fail; spf=pass'), false);
});
