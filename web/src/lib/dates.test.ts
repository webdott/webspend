import { describe, expect, it } from 'vitest';
import { formatDayHeading, groupByDay, monthOf, shiftMonth } from './dates.ts';

const today = new Date(2026, 9, 9, 12, 0, 0); // 9 Oct 2026, local

describe('groupByDay', () => {
  it('groups consecutive items by local day with friendly headings', () => {
    const items = [
      { id: 'a', occurredAt: new Date(2026, 9, 9, 9, 40).toISOString() },
      { id: 'b', occurredAt: new Date(2026, 9, 9, 8, 15).toISOString() },
      { id: 'c', occurredAt: new Date(2026, 9, 8, 18, 20).toISOString() },
      { id: 'd', occurredAt: new Date(2026, 9, 6, 2, 0).toISOString() },
    ];
    const groups = groupByDay(items, today);
    expect(groups.map((g) => g.heading)).toEqual(['Today', 'Yesterday', 'Tue 6 Oct']);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(groups[2]?.items.map((i) => i.id)).toEqual(['d']);
  });

  it('returns no groups for no items', () => {
    expect(groupByDay([], today)).toEqual([]);
  });
});

describe('formatDayHeading', () => {
  it('adds the year for other years', () => {
    expect(formatDayHeading('2025-12-31', today)).toMatch(/2025/);
  });
});

describe('months', () => {
  it('reads the month of a timestamp in local time', () => {
    expect(monthOf(new Date(2026, 9, 1, 0, 30))).toBe('2026-10');
  });
  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
