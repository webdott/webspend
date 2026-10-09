/**
 * Turns an HTML email body into the plain text the parsers expect. Block elements become line
 * breaks and table cell boundaries become ` | `, so GTBank's table alert reads like
 * `shared/sample-alerts/gtbank-debit-card.txt`.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  naira: '₦',
  pound: '£',
  euro: '€',
  copy: '©',
  reg: '®',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  bull: '•',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function htmlToText(html: string): string {
  let text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    // Whitespace between tags is layout, not content.
    .replace(/\r?\n|\t/g, ' ');

  text = text
    .replace(/<\s*br\s*\/?>/gi, '\n')
    // Rows and list items are single-spaced: only their opening tag breaks the line.
    .replace(/<\s*(tr|li)\b[^>]*>/gi, '\n')
    .replace(/<\s*\/\s*(tr|li)\s*>/gi, '')
    .replace(/<\s*\/?\s*(p|div|h[1-6]|table|ul|ol|blockquote|section|article)\b[^>]*>/gi, '\n')
    // A cell boundary becomes a pipe: GTBank's label / colon / value columns stay readable.
    .replace(/<\s*(td|th)\b[^>]*>/gi, '| ')
    .replace(/<\s*\/\s*(td|th)\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '');

  text = decodeEntities(text);

  return text
    .split('\n')
    .map((line) => line.replace(/[  ]+/g, ' ').trim())
    .map((line) => (line.startsWith('|') ? `${line} |`.replace(/\|\s*\|$/, '|') : line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)));
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}
