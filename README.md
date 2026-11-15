# V25 Signals (v1)

Paper-trading signal lab for Deriv **Volatility 25 (1s) Index (`1HZ25V`)**. It uses public market data only, **needs no API token and never places trades**. You place any real trade yourself on Deriv.

> V25 is a synthetic random index. Its price is generated to be unpredictable, so the 1h direction calls are **untested** until the Stats screen shows a verified edge on enough graded signals.

## Open it on iPhone (home-screen app)

1. In Safari, open the live app: **https://moha15558331.github.io/v25-signals/**
2. Tap the **Share** button, then **Add to Home Screen**.
3. Open **V25 Signals** from your home screen. It runs full-screen (standalone) with a dark theme.

The page is a Progressive Web App: live ticks still come straight from Deriv's public WebSocket. A service worker caches the app shell only (HTML, CSS, JS, icons) so the app can reopen if the network is flaky. Tick data and the signal log are never cached.

## Open it locally
- **On your computer or phone:** unzip, then open `index.html` in Chrome, Safari or Edge. For the home-screen / service-worker features, serve the folder instead of using a `file://` URL: `python3 -m http.server 8765` then open http://localhost:8765.
- It connects to `wss://api.derivws.com/trading/v1/options/ws/public` (Deriv's new public API, no app_id or token) and falls back to the legacy `wss://ws.derivws.com/websockets/v3?app_id=1089`.

## Screens (bottom tab bar)
- **Chart:** live candles for 1D, 4H, 1H, 15M, 5M or 1M, plus the 6 nearest support/resistance lines from swing-pivot clusters labelled by strength and touch count (×N). Lines are recalculated per timeframe and on every new candle. The chart also shows the current call (arrow plus a dotted target zone).
- **Signal:** the 1h call (UP, DOWN or NEUTRAL arrow), confidence, entry, target zone, expiry (Bahrain time), an UNTESTED badge and the top 3 reasons, then per-input votes and an indicator snapshot. **Predict now** logs a manual signal.
- **Stats:** overall hit rate vs 50% with n, Wilson 95% CI and binomial p-value. It also shows slices by hour (Bahrain), regime, S/R proximity (near-level vs mid-range), confidence, direction and type. A slice is flagged *edge candidate* only at ≥55% with n≥50 and p<0.05. This screen also has paper trading (balance, stake, payout %, P&L curve), the full log, and CSV/JSON export and import. Data is stored in localStorage.

## Signal log on the phone

The box logger is not reachable from a phone on the public web, so **Sync signal log** first tries `data/signals.json` (a public snapshot committed next to the app) and then `logger/data/signals.json` (only works when you serve this folder from the box). CSV/JSON import still works as a fallback.

Automatic hourly git pushes from the box are not set up: the box has no GitHub credentials, and a token will not be stored in this repository. Until a box-side credential exists (an environment variable or git credential, never committed), refresh the published snapshot by updating `data/signals.json` in the repo, or Import a file on the phone.

## Headless logger (box)
`logger/logger.js` uses the same `shared/core.js` as the app.
- Writes one **bootstrap** test entry at start (flagged, excluded from stats). The supervisor sets `NO_BOOTSTRAP=1` so restarts do not add more test rows.
- Issues an **hourly** signal at every hour boundary (xx:00 Bahrain), only if issued within 60 seconds of the boundary. A late hour is recorded as `status=missed` (excluded from stats); there is no catch-up entry with a late price.
- Grades each open signal 60 min later from the first tick at or after the due time.
- Tick watchdog: if no tick arrives for 15s (or the socket misses ping/pong for 20s), the socket is terminated and resubscribed.
- Single-instance pidfile at `logger/data/logger.pid`.
- Output: `logger/data/signals.json`, `signals.csv`, `status.json`, `logger.out`. Heartbeat is written to `status.json` every 10s.

Run it under the supervisor so it comes back after a crash or a stuck event loop (stale heartbeat > 45s is killed and restarted):

```
cd logger && nohup bash supervise.sh 1HZ25V >> data/supervisor.out 2>&1 &
```
Requires Node ≥ 22, which has a built-in WebSocket. Import `signals.csv` or `signals.json` in Stats → Import.

## Prediction model
Each input votes from −1 to +1. The weighted sum gives the score; |score| < 0.15 is NEUTRAL. Weights: swing structure (D .35, 4h .30, 1h .20, 15m .15 inside the vote) **0.30**, nearest S/R (bounce off support / rejection at resistance, scaled by touches, only when ≤0.5×ATR away) **0.25**, EMA 20/50/200 position plus EMA50 slope **0.15**, MACD(12,26,9) histogram sign and slope **0.10**, RSI(14) **0.08**, Bollinger(20,2) %B **0.07** (squeeze trims confidence), hour-of-day historical up-ratio **0.05**. The volatility regime (low/normal/high) scales confidence down in high vol. ATR(14,1h) sets the target zone. Confidence is 50–80% and is a heuristic, not a calibrated probability. See `SCHEMA.md` for the log format.

## Paper trading
Rise/Fall payouts on Deriv are **below 100%** of stake (check your trade ticket; the default here is 95%). At 95% the break-even hit rate is 51.3%.

## Symbols
1HZ25V (default), R_25, 1HZ10V, 1HZ75V, R_75, JD10. Deriv currently lists no `1HZ5V` (Volatility 5) symbol.

## v2.0 (Nov 2026): redesign + demo auto-trading

- New minimal UI: Chart, Signal and Stats tabs; power-user detail (votes, indicators, paper settings, raw log, import/export) lives in the Details sheet (top-right button).
- **Demo auto-trading** runs only in the box logger (`logger/demo-trader.js`), never in the browser. It trades a Deriv **demo** account on each on-time hourly buy/sell (CALL/PUT, 1h, `logger/demo-config.json` stake, default $1).
  - Auth: Deriv new Options API. PAT token + App ID read from a chmod-600 secrets file on the box, outside the repo (`DERIV_DEMO_TOKEN`, `DERIV_APP_ID`), never committed. `GET /accounts` → demo account → `POST /accounts/{id}/otp` → `wss://api.derivws.com/trading/v1/options/ws/demo?otp=…`. Refuses unless the account is `demo` and the socket is the `/ws/demo` endpoint.
  - Guards: max 1 open trade, daily loss cap (default $5, Bahrain day), kill switch (`touch logger/data/KILL`), `enabled:false` in config.
  - Results go into each signal's `demo_trade` field; a sanitized status is written to `data/demo.json` for the phone.
  - Reset demo balance (Deriv default $10,000): `touch logger/data/RESET_DEMO_BALANCE` or `node logger/demo-trader.js --reset-balance`. The phone button resets the local paper balance and explains that the Deriv reset runs from the box (the phone never holds the token).
  - CLI: `node logger/demo-trader.js --check | --test-trade 0.35 buy | --settle | --reset-balance`.
