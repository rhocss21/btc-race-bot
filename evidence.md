# Evidence brief — btc-race-bot (btc-race-24h-20261117-0603)

## What the benchmark rewards
One asset (CBBTC/USDC), $1,000 paper, long only, 1,440 one-minute bars.
Fills at the next bar's open; a full round trip costs ~26 bps (4 bps fee +
2 bps slippage + ~7 bps impact each way). Ranking is **net PnL on an unseen
24h race window**; the dev window only decides who races. The dev gate is
**net PnL > $0 after all fees**, with >= 1 trade and max drawdown <= 25%.
Prizes: $250 total, top 10 ($60/$40/$30/$25/$20/$15x5), USDC on Solana.
An entry whose action log matches an earlier entry's (>= 1 fill) takes no
prize, so the strategy must be genuinely different from every baseline.

## What the dev window looks like (verified)
1,440 bars; first close $64,461.04, last $64,775.95, window return +0.489%,
range 2.49% (min $63,874 / max $65,467). 1-min return stdev 6.44 bps; only
0.6% of bars move > 26 bps (i.e. one bar rarely pays for a round trip).
Hourly blocks: h0-4 -0.22%, h4-8 -0.40%, h8-12 +1.08%, h12-16 +0.92%,
h16-20 -1.06%, h20-24 -0.03%. The money is in multi-hour regimes, not
minute noise. B&H max drawdown 2.12%.

## Baselines on dev (grade-local, --driver process, verified)
| baseline | dev net PnL | trades | verdict |
|---|---|---|---|
| ema-cross (EMA 8/21) | -$106.21 | 68 | FAIL — churned to death |
| adx-momentum | -$32.66 | 26 | FAIL |
| rsi-bollinger | -$24.25 | 11 | FAIL |
| hold-cash | $0.00 | 0 | FAIL (gate needs > $0) |
| buy-and-hold | +$1.07 | 1 | PASS, thin |
| momentum (24-bar return) | +$2.45 | 1 | PASS, thin |

Pattern: every active baseline bled on 1-min noise vs 26 bps costs. The two
passers bought early and held. A slow trend-chase does no better: Hermes'
first draft (EMA180 + 120-bar momentum, buffered confirmation, 1% stop)
simulated at **-$19.61** (6 trades) — it bought the top of the run at bar 510
($65,116) and stopped out. Chasing a +1.77% two-hour run buys the top.

## The gate to clear
Final entry's latest dev grade net PnL **> $0** (aim >= +$5 for margin),
>= 1 trade, max drawdown <= 25%, and beat every baseline on dev. This bot
clears it with **+$10.10** — 4.1x the best baseline.

## This bot: dip-buy + trailing-stop ride
- **Entry:** close >= 75 bps **below** its 240-bar (4h) simple mean. A dip
  that deep is rare (twice in 1,440 dev bars) and buys weakness, not a top.
  Max 4 entries/window, 60-bar cooldown after an exit, no entries in the
  last 60 bars.
- **Exit:** trailing stop 90 bps below the highest close since entry (lets a
  multi-hour run develop, exits when it rolls over) + hard stop 120 bps
  below the entry fill as a tail guard for the unseen window.
- **Size:** 100% of cash, one position, long only. Exact bigint arithmetic;
  no clock, no randomness, no network — deterministic by construction.

## Measured dev result (grade-local, --driver process, twice)
- **Net PnL +$10.100602** (return +1.01%), fees $1.61, **at 2x fees still
  +$8.49**. 3 trades, win rate 0.50, **max drawdown 1.61%**, exposure 35.8%,
  0 rejected orders. Guardrails met. L1 regrade reproduced byte for byte;
  action_log_sha256 `b673d4bac364215291221679194ec27691fdd447babd3da5d2c8af9a812a8701`
  identical across two separate grade-local runs.
- Trades: buy bar 371 fill $64,040 (the dip to $63,874) -> sell bar 541 fill
  $64,807 (+$11.16 on the trade); buy bar 1094 fill $64,707 -> flattened at
  the last close (-$1.02). Net +$10.10.

## Why it beats the baselines (and why it should survive the race window)
1. **It does not pay the noise tax.** 2 entries vs 11-68 for the active
   baselines; every trade must clear ~26 bps, so frequency is the enemy.
2. **It buys the dip, not the top.** Trend entries fired after the move
   (+177 bps 2h momentum) and lost; the dip entry bought the window low.
3. **Robust, not knife-edge.** Neighbourhood check (offline simulator,
   same fill model, verified to reproduce grade-local to the cent):
   SMA {180, 240, 300} x dip {70, 75, 80} bps x trail {80, 90, 100} bps
   all give +$7.20 to +$11.77; trail 60 bps is the only nearby failure
   (exits on noise, -$8.88). First half +$11.16, second half -$1.02:
   it makes money in H1 and is roughly flat in H2 — no half depends on a
   single lucky bar, and the hard stop caps a race-window downtrend at
   ~1.2% + costs per entry, max 4 entries.
4. **Genuinely different behaviour.** No baseline buys a dip below a long
   mean, uses a trailing stop from the peak, or produces this action log
   (2 fills in the first half, 1 in the second; ema-cross has 68 trades,
   momentum buys bar 24 and holds).
