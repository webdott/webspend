import { CURRENCIES } from '@webspend/shared';
import type { RateSource, RateTable } from './source.ts';

const URL = 'https://open.er-api.com/v6/latest/USD';

/** Daily official-style rates from open.er-api.com. No key, updated once a day. */
export const openErApiSource: RateSource = {
  name: 'open.er-api.com',
  async fetchLatest(): Promise<RateTable> {
    const response = await fetch(URL, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`open.er-api.com answered ${response.status}`);
    const body = (await response.json()) as { result?: string; rates?: Record<string, number> };
    if (body.result !== 'success' || !body.rates) throw new Error('open.er-api.com: no rates');
    const table: RateTable = {};
    for (const currency of CURRENCIES) {
      const rate = body.rates[currency];
      if (typeof rate === 'number' && rate > 0) table[currency] = rate;
    }
    return table;
  },
};
