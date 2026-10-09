import { describe, expect, it } from 'vitest';
import { exportFilename, exportPath, monthBounds, rangeProblem, yearBounds } from './export.ts';

describe('export helpers', () => {
  const today = new Date(2026, 9, 9); // 9 Oct 2026

  it('bounds a finished month fully and a running month up to today', () => {
    expect(monthBounds('2026-09', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthBounds('2026-10', today)).toEqual({ from: '2026-10-01', to: '2026-10-09' });
    expect(yearBounds(today)).toEqual({ from: '2026-01-01', to: '2026-10-09' });
  });

  it('builds the path with only the filters that are set', () => {
    expect(exportPath({ format: 'csv', from: '2026-10-01', to: '2026-10-09' })).toBe(
      '/api/exports?format=csv&from=2026-10-01&to=2026-10-09',
    );
    expect(
      exportPath({ format: 'pdf', from: '2026-10-01', to: '2026-10-09', type: 'expense' }),
    ).toBe('/api/exports?format=pdf&from=2026-10-01&to=2026-10-09&type=expense');
    expect(exportFilename({ format: 'pdf' }, { from: '2026-10-01', to: '2026-10-09' })).toBe(
      'webspend-2026-10-01-to-2026-10-09.pdf',
    );
  });

  it('refuses a backwards or future range', () => {
    expect(rangeProblem({ from: '2026-10-01', to: '2026-10-09' }, today)).toBeNull();
    expect(rangeProblem({ from: '2026-10-09', to: '2026-10-01' }, today)).toMatch(/after/);
    expect(rangeProblem({ from: '2026-10-01', to: '2026-10-10' }, today)).toMatch(/future/);
    expect(rangeProblem({ from: '', to: '2026-10-10' }, today)).toMatch(/both/);
  });
});
