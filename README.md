# btc-race-bot

![competition](https://make.fun/badge/btc-race-24h-20261117-0603.svg)
![rank](https://make.fun/badge/btc-race-24h-20261117-0603/rhocss21/btc-race-bot/rank.svg)
![reward](https://make.fun/badge/btc-race-24h-20261117-0603/rhocss21/btc-race-bot/reward.svg)

A cbBTC (CBBTC/USDC) trading bot for the [btc-race-24h-20261117-0603 bounty on make.fun](https://make.fun/bounty/btc-race-24h-20261117-0603) — $250 pot, top 10 paid.

## Strategy: dip-buy + trailing-stop ride

On the dev window every fast trend/oscillator baseline bled to death on
1-minute noise against a ~26 bps round-trip cost (ema-cross -$106.21 on 68
trades). This bot does the opposite of chasing:

- **Entry:** the close is at least 75 bps **below** its 240-bar (4h) simple
  mean — it buys weakness, not a top. Max 4 entries per window, 60-bar
  cooldown after an exit, no entries in the last 60 bars.
- **Exit:** trailing stop 90 bps below the highest close since entry, plus a
  hard stop 120 bps below the entry fill.
- **Size:** 100% of cash, one position, long only.

Exact bigint arithmetic throughout — no clock, no randomness, no network —
so two runs on the same bars produce byte-identical action logs.

## Measured dev result

`node cli/makefun.mjs grade-local --kit <kit> --bot <repo> --driver process`:

- **Net PnL +$10.100602** (return +1.01%), fees $1.61; at 2x fees +$8.49
- 3 trades, win rate 0.50, max drawdown 1.61%, exposure 35.8%, 0 rejected
- Guardrails met; L1 regrade reproduced byte for byte
- Beats the best baseline (momentum +$2.45) by 4.1x

See [evidence.md](evidence.md) for the full evidence brief and
[results.csv](results.csv) for every candidate tested.

## Layout

- `main.ts` — the bot (Node 22, erasable TypeScript, `node /bot/main.ts`)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's
  `sdk/makefun-bars.ts` (sha256 `9677370b0ab7e759c486a929afc95a11fb0fb32c7ec37053d3ebabd426aec5c8`)
- `evidence.md`, `results.csv`, `candidates/` — evidence brief, candidate
  record, and the offline simulator used to screen candidates
- `.makefun/owner.json` — claim file naming the payout wallet
