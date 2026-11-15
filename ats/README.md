# ATS · Auto Trading System (v4.1)

A remote control and dashboard for the **ATS bot**, which runs 24/7 on Mohamed's server (`ats.2-29-170-227.sslip.io`). It is **demo by default**.

## The ATS bot (strategy `hybrid`)

- **Differs:** DIGITDIFF on Volatility 25 (1s) `1HZ25V`, 1 tick, $0.35. It predicts the **least-occurring last digit of the last 100 ticks**. On a tie it takes the colder digit, the one whose last appearance came earliest. This is an exact port of the old HTML analyzer and the hybrid backtest (`shared/hybrid.js`, checked on 20,000 real ticks).
- **Recovery:** a Differs loss switches to **1-tick Over 2 / Under 7** with martingale ×3.1 over 3 steps ($1.09 → $3.36 → $10.43; each step capped by the stops and the $3.50 stake cap).
  - **Smart martingale** cuts any stake down to the room left before a stop-loss.
  - A recovery win goes back to Differs at the base stake. If all 3 steps lose, the bot also goes back to base.
- **Recovery side:** Auto picks the side whose losing digits were rarer in the last 100 ticks (0–2 for Over 2, 7–9 for Under 7); a tie goes to the last 20 ticks, then Over 2. It can be fixed to Over 2 or Under 7 in Settings.
- **Daily limits:** a +$1 lock and a −$2 stop. They reset at 00:00, and the bot waits and then carries on by itself.
- **Halt the bot (press Start again):** session SL $6 / TP $3, 4 losses in a row, the $3.50 stake cap, and the ATS session limits −$10 / +$6.
- **Pacing:** a 2.5 s gap after each Differs win.

## Rise/Fall 1H (second bot, demo only)

- One Rise/Fall contract per hour candle, bought in the first minute of the hour, expiring at the next hour.
- Direction from the chart analysis (`core.js`) on 1h candles with 4h and 1d above. No signal means the hour is skipped.
- $0.35 base, martingale ×2.1 over 3 steps, smart martingale, its own daily +$1 / −$2.
- It runs next to the ATS bot on the same demo account. The session limits count both bots together.

## Real money (off by default)

1. Put the real token on the server as `/opt/ats/.secrets/deriv-real.env`, with the line `DERIV_REAL_TOKEN=...` (owner `ats`, mode 600). No restart is needed.
2. In the app, open Account (top right) → **Real**, then confirm on the **Switch to Real money** sheet. The phone also sends its server key. Switching back to Demo is one tap.
3. **Hard caps:** daily stop of $2 at most (adjustable under Settings → Daily limits), and no stake above the stake cap. An optional lifetime real-loss cap lives under Settings → Real money (Off by default). When that cap is on and is hit, real mode turns itself off and the bot stops.
4. Only the ATS bot runs on real. Switching account requires the bot to be stopped, and it starts a fresh session.

**Reset demo balance, Reset today, and Clear history & stats** live under Settings → Demo tools (Reset today is also on the Home card). They only work on demo. Clear history wipes demo trades, stats, alerts and today’s counters; real records are never erased.

**Lifetime loss cap:** Settings → Real money. Off by default. When you turn it on, real mode turns itself off if total real losses reach the amount you set. Lifetime real P/L is on the Stats tab. The daily stop stays under Daily limits.

## App

- **Home:** two bot cards (Start/Stop, status, today P/L, phase). Tap a card to see that bot's day bar, phase, effective stake ladder and recent trades.
- **Stats:** per bot. ATS: Differs win rate, recovery step win rates, chains saved/lost, P/L by phase, hour, day and digit.
- **History:** trades filtered by bot, with CSV export.
- **Settings:** every bot setting, account, appearance (Automatic / Light / Dark), and server.
- **Alerts:** in-app toasts from the server's event feed.
- `legacy/` is the old v3 app with the phone mode (the bot running inside the phone).

API: `/api/status`, `/api/stats`, `/api/events`, `/api/real`, `/api/demo/reset`, `/api/day/reset`, `/api/history/clear`, `/api/settings`, `/api/bot/start|stop`, `/api/history`.

None of this has a tested edge: the backtests lost money over time.
