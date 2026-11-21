# ATS app v4.8

A remote control and dashboard for the bots running 24/7 on Mohamed's server. Demo by default.

## Bots (v4.8)
- **Rise and Fall**: Rise/Fall on Volatility 25 (1s) with candle cycle, martingale, sessions and daily lock/stop. The only bot allowed on Real.
- **Even/Odd**, **Over/Under** (barriers), **Matches/Differs** (market, own or random digit): 1–10 tick digit contracts on any Volatility index (default V25 1s). Demo only. Each has its own stake, ticks, martingale (factor or auto from the payout, steps, reset on a win), sessions, and daily lock/stop.
- **MT5**: ATS_V25 EA on Deriv-Demo, with optional loss recovery (factor, max steps, max lot, reset on any win or once the loss is won back).

Every bot starts and stops on its own, several can run at once, and **Stop all** stops everything. History and Stats filter by bot.
Settings forms are built once and never re-rendered by the status poll, so the keyboard stays open while typing.

---

## Earlier notes


A remote control and dashboard for the **ATS bot**, which runs 24/7 on Mohamed's server (`ats.2-29-170-227.sslip.io`). It is **demo by default**.

## The ATS bot (strategy `mult`, v4.3)

- **Contract:** Deriv Multipliers, MULTUP (Up) / MULTDOWN (Down). Default Volatility 25 (1s) `1HZ25V` ×160 (the lowest allowed), $1 stake (Deriv minimum), take-profit $0.50 and stop-loss $0.50 per trade, commission $0.02. One position at a time.
- **Markets:** V25 (1s) ×160/400/800/1200/1600, V75 `R_75` ×50/100/200/300/500, Jump 10 `JD10` ×100/200/300/500/1000 (SL up to 90% of stake). V5 has no contracts on Deriv.
- **Direction:** every minute, an ensemble of RSI, MACD, EMA 9/21/50, Bollinger, Stochastic, ADX and ROC on 1m / 5m / 15m / 1h, plus the `core.js` chart analysis (multi-timeframe structure, S/R, EMAs). It trades only when at least 65% of the votes agree (setting); otherwise it waits (`shared/mult.js`).
- **Sessions:** 7 a day, each ends at +$0.50 or −$2, 60 s pause. The day locks at +$3.50 (or after 7 sessions) and stops at −$4, then carries on at 00:00 Bahrain.
- **Smart stop-loss cap:** a trade's stop-loss is cut to the room left in the session and the day. Martingale is off by default (setting: stake, TP and SL × factor after a loss).
- **Close now:** the open position can be sold from the Home card. Stop leaves an open position to its TP / SL.
- **Backtest (17 Oct–15 Nov 2026, real 1s ticks):** 446 trades, 50.2% won, ±$0.50 each, +$1.28 net; random direction did +$2.38. Expected value per trade is −$0.02 (commission); see /workspace/mult.

Older strategies (Differs + Over/Under, Rise/Fall 1H) are kept in the code and history, not shown in the app.

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
