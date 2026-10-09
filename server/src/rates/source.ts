import type { Currency } from '@webspend/shared';

/** Units of each currency per one US dollar. USD itself is always 1 and need not be included. */
export type RateTable = Partial<Record<Currency, number>>;

export interface RateSource {
  readonly name: string;
  fetchLatest(): Promise<RateTable>;
}
