import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import {
  BANK_LABELS,
  formatMinor,
  formatSigned,
  type Currency,
  type Transaction,
  type User,
} from '@webspend/shared';
import { lagosDay } from '../ledger/time.ts';

// DejaVu Sans carries the naira sign, the approx sign and the true minus, which the built-in
// PDF fonts do not. Only the glyphs used are embedded.
const require = createRequire(import.meta.url);
const FONT = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const INK = '#0B0D10';
const MUTED = '#5B6472';
const LINE = '#E3E6EB';
const ACCENT = '#5B4BFF';

const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const CONTENT = PAGE.width - PAGE.margin * 2;
const COLUMNS = { date: 72, amount: 112, usd: 80 };
const TITLE_WIDTH = CONTENT - COLUMNS.date - COLUMNS.amount - COLUMNS.usd;
const ROW_HEIGHT = 30;

export type ExportRange = { from: string; to: string };

type Totals = {
  spentMinor: number;
  incomeMinor: number;
  spentUsdMinor: number | null;
  incomeUsdMinor: number | null;
  transfers: number;
};

/** An A4 statement: a totals strip, then one row per transaction, newest first. */
export function transactionsPdf(
  transactions: Transaction[],
  user: Pick<User, 'defaultCurrency'>,
  range: ExportRange,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE.margin,
      bufferPages: true,
      info: { Title: `WebSpend transactions ${range.from} to ${range.to}`, Author: 'WebSpend' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
    doc.registerFont('body', FONT);
    doc.registerFont('bold', FONT_BOLD);

    drawHeader(doc, range, transactions.length);
    drawTotals(doc, totalsOf(transactions, user.defaultCurrency), user.defaultCurrency);
    drawTable(doc, transactions);
    drawPageNumbers(doc);
    doc.end();
  });
}

function drawHeader(doc: PDFKit.PDFDocument, range: ExportRange, count: number): void {
  doc.rect(PAGE.margin, PAGE.margin, 18, 18).fill(ACCENT);
  doc
    .font('bold')
    .fontSize(9)
    .fillColor('#FFFFFF')
    .text('W', PAGE.margin, PAGE.margin + 4.5, {
      width: 18,
      align: 'center',
    });
  doc
    .font('bold')
    .fontSize(16)
    .fillColor(INK)
    .text('WebSpend', PAGE.margin + 26, PAGE.margin - 1);
  doc
    .font('body')
    .fontSize(10)
    .fillColor(MUTED)
    .text(
      `Transactions · ${longDay(range.from)} to ${longDay(range.to)} · ${count} ${count === 1 ? 'entry' : 'entries'}`,
      PAGE.margin,
      PAGE.margin + 30,
    );
  doc.moveDown(1.2);
}

function drawTotals(doc: PDFKit.PDFDocument, totals: Totals, currency: Currency): void {
  const top = doc.y;
  const boxHeight = 58;
  doc.roundedRect(PAGE.margin, top, CONTENT, boxHeight, 8).fill('#F5F6F8');
  const cells = [
    ['Spent', formatMinor(totals.spentMinor, currency), approx(totals.spentUsdMinor, currency)],
    ['Income', formatMinor(totals.incomeMinor, currency), approx(totals.incomeUsdMinor, currency)],
    [
      'Net',
      formatSigned(
        Math.abs(totals.incomeMinor - totals.spentMinor),
        currency,
        totals.incomeMinor >= totals.spentMinor ? 'income' : 'expense',
      ),
      totals.transfers
        ? `${totals.transfers} transfer${totals.transfers === 1 ? '' : 's'} to self not counted`
        : '',
    ],
  ];
  const cellWidth = CONTENT / cells.length;
  cells.forEach(([label, value, note], index) => {
    const x = PAGE.margin + 14 + cellWidth * index;
    doc
      .font('body')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(label!, x, top + 10);
    doc
      .font('bold')
      .fontSize(13)
      .fillColor(INK)
      .text(value!, x, top + 23);
    if (note)
      doc
        .font('body')
        .fontSize(8)
        .fillColor(MUTED)
        .text(note, x, top + 42);
  });
  doc.y = top + boxHeight + 18;
}

function drawTable(doc: PDFKit.PDFDocument, transactions: Transaction[]): void {
  drawColumnHeads(doc);
  for (const t of transactions) {
    if (doc.y + ROW_HEIGHT > PAGE.height - PAGE.margin - 16) {
      doc.addPage();
      drawColumnHeads(doc);
    }
    drawRow(doc, t);
  }
  if (transactions.length === 0) {
    doc
      .font('body')
      .fontSize(10)
      .fillColor(MUTED)
      .text('No transactions in this range.', PAGE.margin, doc.y + 8);
  }
}

function drawColumnHeads(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  const x = columnX();
  doc.font('body').fontSize(8).fillColor(MUTED);
  doc.text('Date', x.date, y, { width: COLUMNS.date });
  doc.text('Transaction', x.title, y, { width: TITLE_WIDTH });
  doc.text('Amount', x.amount, y, { width: COLUMNS.amount, align: 'right' });
  doc.text('≈ USD', x.usd, y, { width: COLUMNS.usd, align: 'right' });
  doc
    .moveTo(PAGE.margin, y + 13)
    .lineTo(PAGE.margin + CONTENT, y + 13)
    .strokeColor(LINE)
    .lineWidth(0.5)
    .stroke();
  doc.y = y + 18;
}

function drawRow(doc: PDFKit.PDFDocument, t: Transaction): void {
  const y = doc.y;
  const x = columnX();
  const muted = t.type === 'transfer';
  // The bank is named only when the account's own name does not already say it.
  const bank = BANK_LABELS[t.bank];
  const details = [
    t.categoryName ?? (t.type === 'expense' ? 'Needs a category' : null),
    t.accountName,
    t.accountName.toLowerCase().includes(bank.toLowerCase()) ? null : bank,
    t.type === 'transfer' ? 'Transfer to self' : null,
    t.unsureTransfer ? 'Unsure' : null,
    t.isFee ? 'Fee' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  doc
    .font('body')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(shortDay(lagosDay(t.occurredAt)), x.date, y + 3, {
      width: COLUMNS.date,
    });
  doc
    .font('bold')
    .fontSize(9.5)
    .fillColor(muted ? MUTED : INK)
    .text(t.title, x.title, y, {
      width: TITLE_WIDTH - 8,
      height: 12,
      ellipsis: true,
      lineBreak: false,
    });
  doc
    .font('body')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(details, x.title, y + 13, {
      width: TITLE_WIDTH - 8,
      height: 10,
      ellipsis: true,
      lineBreak: false,
    });
  doc
    .font('bold')
    .fontSize(9.5)
    .fillColor(muted ? MUTED : INK)
    .text(formatSigned(t.amountMinor, t.currency, t.type), x.amount, y + 2, {
      width: COLUMNS.amount,
      align: 'right',
    });
  doc
    .font('body')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(
      t.currency === 'USD' || t.usdMinor === null ? '' : formatMinor(t.usdMinor, 'USD'),
      x.usd,
      y + 3,
      {
        width: COLUMNS.usd,
        align: 'right',
      },
    );
  doc
    .moveTo(PAGE.margin, y + ROW_HEIGHT - 4)
    .lineTo(PAGE.margin + CONTENT, y + ROW_HEIGHT - 4)
    .strokeColor(LINE)
    .lineWidth(0.5)
    .stroke();
  doc.y = y + ROW_HEIGHT;
}

function drawPageNumbers(doc: PDFKit.PDFDocument): void {
  const { count } = doc.bufferedPageRange();
  for (let index = 0; index < count; index += 1) {
    doc.switchToPage(index);
    // The footer sits inside the bottom margin. pdfkit starts a new page for any text that
    // crosses that margin, so it is lifted for the one line and put back afterwards.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('body')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`Page ${index + 1} of ${count}`, PAGE.margin, PAGE.height - PAGE.margin + 8, {
        width: CONTENT,
        align: 'right',
        lineBreak: false,
      });
    doc.page.margins.bottom = bottom;
  }
}

function columnX() {
  const date = PAGE.margin;
  const title = date + COLUMNS.date;
  const amount = title + TITLE_WIDTH;
  const usd = amount + COLUMNS.amount;
  return { date, title, amount, usd };
}

/** Sums in the default currency. Transfers to self are counted, not summed. */
function totalsOf(transactions: Transaction[], currency: Currency): Totals {
  const totals: Totals = {
    spentMinor: 0,
    incomeMinor: 0,
    spentUsdMinor: 0,
    incomeUsdMinor: 0,
    transfers: 0,
  };
  for (const t of transactions) {
    if (t.type === 'transfer') {
      totals.transfers += 1;
      continue;
    }
    const amount = t.defaultMinor ?? (t.currency === currency ? t.amountMinor : 0);
    const usd = t.currency === 'USD' ? t.amountMinor : t.usdMinor;
    if (t.type === 'expense') {
      totals.spentMinor += amount;
      totals.spentUsdMinor =
        usd === null || totals.spentUsdMinor === null ? null : totals.spentUsdMinor + usd;
    } else {
      totals.incomeMinor += amount;
      totals.incomeUsdMinor =
        usd === null || totals.incomeUsdMinor === null ? null : totals.incomeUsdMinor + usd;
    }
  }
  return totals;
}

function approx(usdMinor: number | null, currency: Currency): string {
  if (currency === 'USD' || usdMinor === null) return '';
  return `≈ ${formatMinor(usdMinor, 'USD')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-09` → `9 Oct 2026`. */
export function longDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return `${date} ${MONTHS[month - 1]} ${year}`;
}

/** `2026-10-09` → `9 Oct`. */
function shortDay(day: string): string {
  return longDay(day).replace(/ \d{4}$/, '');
}
