import type { Config } from '../config.ts';
import { fixedSource } from './fixed.ts';
import { openErApiSource } from './openErApi.ts';
import type { RateSource } from './source.ts';

export type { RateSource, RateTable } from './source.ts';
export { rateFor, ratesOn, refreshToday, storeRates } from './store.ts';

export function rateSourceFor(config: Config): RateSource {
  return config.rateSource === 'fixed' ? fixedSource(config.fixedRates) : openErApiSource;
}
