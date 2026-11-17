// btc-race-bot: mean-reversion dip-buy + trailing-stop ride, long only, CBBTC/USDC.
//
// Idea (evidence in evidence.md): on the dev window every fast trend/oscillator
// baseline bled to death on 1-minute noise against a ~26 bps round-trip cost,
// while buy-and-hold (+$1.07) and a bar-24 momentum buy (+$2.45) passed only by
// buying early and holding. The window's real money was one intraday regime:
// a ~1% dip to $63,874 followed by a +2.5% run to $65,467. This bot buys that
// shape instead of chasing it:
//   - ENTRY: the close is at least 75 bps BELOW its 240-bar (4h) simple mean.
//     A dip that deep is rare (twice in 1,440 dev bars) and it buys weakness,
//     not a top. At most 4 entries per window, 60-bar cooldown after an exit.
//   - EXIT: a trailing stop 90 bps below the highest close since entry lets a
//     multi-hour run develop and gets out when it rolls over, plus a hard stop
//     120 bps below the entry fill as a tail guard for the unseen race window.
//   - SIZE: 100% of cash on every entry (one position max, long only).
// Everything is exact bigint arithmetic on raw price units (price_scale 5), so
// two runs on the same bars produce byte-identical action logs. No clock, no
// randomness, no network, no environment reads.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Mean window: 240 one-minute closes (4 hours). */
const SMA_BARS = 240;
/** Entry: close <= SMA * (1 - 75 bps). */
const DIP_BPS = 75n;
/** Trailing exit: close <= peak-since-entry * (1 - 90 bps). */
const TRAIL_BPS = 90n;
/** Hard stop: close <= entry fill * (1 - 120 bps). */
const STOP_BPS = 120n;
/** Bars to wait after an exit fill before a fresh entry. */
const COOLDOWN_BARS = 60;
/** Cap on entries per window (dev uses 2). */
const MAX_ENTRIES = 4;
/** Do not open a new position in the last hour of bars: a fill there would be
    flattened almost immediately for a round trip of costs and no edge. */
const NO_ENTRY_AFTER_SEQ = 1380;
/** 2% slippage cap vs the latest close; 1-minute moves are ~6 bps stdev, so
    this only refuses absurd fills, never a normal one. */
const MAX_SLIPPAGE_BPS = 200;
const BPS = 10_000n;

/** Rolling closes (at most SMA_BARS) and their exact bigint sum. */
const closes: bigint[] = [];
let closesSum = 0n;
/** Fill price of the open position (null when flat); peak close since entry. */
let entryPrice: bigint | null = null;
let peak: bigint | null = null;
let entries = 0;
let lastExitSeq = -1_000_000;
/** Client id of an order sent last batch and not yet answered by a fill. */
let pendingBuyId: string | null = null;
let pendingSellId: string | null = null;

function pushClose(c: bigint): void {
  closes.push(c);
  closesSum += c;
  if (closes.length > SMA_BARS) closesSum -= closes.shift()!;
}

/** True when the latest close sits at least DIP_BPS below the 240-bar mean. */
function isDip(close: bigint): boolean {
  if (closes.length < SMA_BARS) return false;
  // close <= SMA * (10000 - DIP) / 10000  <=>  close * 10000 * 240 <= sum * (10000 - DIP)
  return close * BPS * BigInt(SMA_BARS) <= closesSum * (BPS - DIP_BPS);
}

await runBars({
  onBatch(state: BarsState, batch): OrderInput[] {
    // Settle last batch's orders from this batch's fills first.
    for (const f of batch.fills) {
      if (f.client_id === pendingBuyId) {
        pendingBuyId = null;
        if (f.status === 'filled') {
          entryPrice = BigInt(f.price);
          peak = BigInt(f.price);
          // Count the entry only once its fill lands: a buy the market
          // refuses (slippage, no bar) must not consume the entry budget.
          entries += 1;
        }
      }
      if (f.client_id === pendingSellId) {
        pendingSellId = null;
        if (f.status === 'filled') {
          entryPrice = null;
          peak = null;
          lastExitSeq = batch.seq;
        }
      }
    }

    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar !== undefined) pushClose(BigInt(bar.c));
    const close = state.close(SYMBOL);
    if (close === null || state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined && held.qty > 0n) {
      if (peak === null || close > peak) peak = close;
      const trailHit = peak !== null && close * BPS <= peak * (BPS - TRAIL_BPS);
      const stopHit =
        entryPrice !== null && close * BPS <= entryPrice * (BPS - STOP_BPS);
      if ((trailHit || stopHit) && pendingSellId === null) {
        const id = state.clientId();
        pendingSellId = id;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: id }];
      }
      return [];
    }

    // Flat: consider an entry.
    if (pendingBuyId !== null || pendingSellId !== null) return [];
    if (entries >= MAX_ENTRIES) return [];
    if (batch.seq - lastExitSeq < COOLDOWN_BARS) return [];
    if (batch.seq >= NO_ENTRY_AFTER_SEQ) return [];
    if (state.cash <= 0n) return [];
    if (!isDip(close)) return [];
    const id = state.clientId();
    pendingBuyId = id;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: id }];
  },
});
