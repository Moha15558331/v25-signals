# ATS · Auto Trading System (v4)

A remote control and dashboard for the **ATS bot**, which runs 24/7 on Mohamed's server (`ats.2-29-170-227.sslip.io`). It is **demo by default**. Times are Bahrain (UTC+3).

## The ATS bot (strategy `hybrid`)

- **Differs:** DIGITDIFF on Volatility 25 (1s) `1HZ25V`, 1 tick, $0.35. It predicts the **least-occurring last digit of the last 100 ticks**. On a tie it takes the colder digit, the one whose last appearance came earliest. This is an exact port of the old HTML analyzer and the hybrid backtest (`shared/hybrid.js`, checked on 20,000 real ticks).
- **Recovery:** a Differs loss switches to **15-second Rise/Fall** with martingale ×2.1 over 3 steps ($0.74 → $1.54 → $3.24).
  - **Smart martingale** cuts any stake down to the room left before a stop-loss.
  - A recovery win goes back to Differs at the base stake. If all 3 steps lose, the bot also goes back to base.
- **Recovery direction:** `core.js predict()` on the shortest candles Deriv serves (1m main, 5m and 30m higher), with the forming candles closed at the latest tick.
  - Inside the dead zone it follows the sign of the score.
  - At a score of exactly 0 it follows the last 15 ticks.
- **Daily limits:** a +$1 lock and a −$2 stop. They reset at 00:00 Bahrain, and the bot waits and then carries on by itself.
- **Halt the bot (press Start again):** session SL $6 / TP $3, 4 losses in a row, the $3.50 stake cap, and the ATS session limits −$10 / +$6.
- **Pacing:** a 2.5 s gap after each Differs win.

## Real money (off by default)

1. Put the real token on the server as `/opt/ats/.secrets/deriv-real.env`, with the line `DERIV_REAL_TOKEN=...` (owner `ats`, mode 600). No restart is needed.
2. In the app, open Account (top right) → **Real**, type **REAL**, and confirm. The phone also sends its server key.
3. **Hard caps:** daily stop of $2 at most, no stake above the stake cap, and a lifetime real-loss cap (default $10, set under Settings → Account). When the cap is hit, real mode turns itself off and the bot stops.
4. Only the ATS bot runs on real. Switching account requires the bot to be stopped, and it starts a fresh session.

**Reset demo balance:** Account → Reset demo balance. It works on the demo token only.

## App

- **Home:** today against the −$2/+$1 bar, the phase (Differs / Recovery step n) with the predicted digit and the stake ladder, Start/Stop, and recent trades.
- **Stats:** Differs win rate, recovery step win rates, chains saved/lost, P/L by phase, hour, day and digit.
- **History:** trades with CSV export.
- **Settings:** every bot setting, account, appearance (Automatic / Light / Dark), and server.
- **Alerts:** in-app toasts from the server's event feed.
- `legacy/` is the old v3 app with the phone mode (the bot running inside the phone).

API: `/api/status`, `/api/stats`, `/api/events`, `/api/real`, `/api/demo/reset`, `/api/settings`, `/api/bot/start|stop`, `/api/history`.

None of this has a tested edge: the backtests lost money over time.
