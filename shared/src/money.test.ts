import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  convertMinor,
  formatMinor,
  formatRate,
  formatSigned,
  parseMinor,
  toUsdMinor,
} from './money.ts';

test('formats minor units with grouping and two decimals', () => {
  assert.equal(formatMinor(1_850_000, 'NGN'), '₦18,500.00');
  assert.equal(formatMinor(5, 'USD'), '$0.05');
  assert.equal(formatMinor(-120_000_000, 'NGN'), '−₦1,200,000.00');
});

test('signs by type', () => {
  assert.equal(formatSigned(4_380_000, 'NGN', 'expense'), '−₦43,800.00');
  assert.equal(formatSigned(300_000_000, 'NGN', 'income'), '+₦3,000,000.00');
  assert.equal(formatSigned(5_000_000, 'NGN', 'transfer'), '₦50,000.00');
});

test('rate line', () => {
  assert.equal(formatRate(1500, 'NGN'), '$1 = ₦1,500.00');
});

test('converts through dollars', () => {
  assert.equal(toUsdMinor(1_850_000, 1500), 1233);
  assert.equal(convertMinor(1_850_000, 1500, 0.78), 962);
});

test('parses typed amounts', () => {
  assert.equal(parseMinor('1,200,000'), 120_000_000);
  assert.equal(parseMinor('18500.5'), 1_850_050);
  assert.equal(parseMinor('₦2,413.00'), 241_300);
  assert.equal(parseMinor('abc'), null);
});
