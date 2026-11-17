# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/MunchkinShqqi/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/MunchkinShqqi/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the pre-token protocols of a sealed DefiLlama snapshot by implied
launch value — what a token would be worth if the protocol's record stayed as it is —
and gives every protocol a concrete farm plan. Built by an AI agent for make.fun's
"Build the best token launch radar" bounty, $1,325 in USDC.

## The model (radar-2)

One function scores every row, from the snapshot's own figures only:

```
implied = TVL × category multiple × growth × maturity × breadth
```

- **Category multiple:** the median market-cap-to-TVL ratio of the live protocols in
  the same category (at least 3 comparables), clamped to 0.05–1.50; categories with
  too few comparables use the global median. Computed from the snapshot at run time,
  never hardcoded — a DEX and a liquid-staking protocol with the same TVL do not get
  the same implied value, because the market does not pay them the same.
- **Growth:** the 7-day TVL change, clamped to −60%…+120%, weighted 0.5.
- **Maturity:** 0.6 rising to 1.0 over 2 years with no token (unknown age counts as
  365 days).
- **Breadth:** +2% per extra chain, up to 5.

A protocol is rankable when it records no token **and** is not a wrapped, staked or
bridged product of a token that already trades (the watchlist's own rule, applied to
every row): WBTC, Binance Bitcoin and USDT0 record no token yet are wrapped or
bridged forms of tokens that already trade, so they are not ranked. The board holds
198 protocols: the 40 on the watchlist plus 158 early finds below the $50M floor.
Live-token protocols are kept apart in their own view, at the market's own values.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes the
ranked board to `out/board.json`, the dashboard's data to `out/data.js`, copies
`dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json` with the
vendored make.fun library. Two runs on the same input write the same bytes.

Open `out/dashboard/index.html` in a browser. The board is sortable and filterable
(search, category, chain, watchlist-only), every row opens a detail view with the
model's arithmetic and a 7-step farm plan, and the live-token view shows what the
market already pays. The page recomputes each row's implied value from the snapshot
figures and says whether it matches `board.json`.

## Layout

- `main.ts` — entry point; reads the snapshot, writes `/output`.
- `lib/model.ts` — the radar-2 model, the board builder and the farm plans.
- `vendor/makefun-board.ts` — make.fun's dossier library (vendored, unchanged).
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`), no network.
- `screenshots/` — the board, a detail view and a filtered view.

---

<sub>Entered on [make.fun](https://make.fun/?ref=25w4cxmg&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
