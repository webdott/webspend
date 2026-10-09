import type { RateSource, RateTable } from './source.ts';

export function fixedSource(rates: RateTable): RateSource {
  return {
    name: 'fixed',
    async fetchLatest() {
      return { ...rates };
    },
  };
}
