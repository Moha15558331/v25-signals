# ATS · Auto Trading System

Open it at: https://moha15558331.github.io/v25-signals/ats/

A standalone home-screen web app (PWA) that runs one **Rise/Fall bot on Volatility 25 (1s)** (`1HZ25V`) on a Deriv **options** account through the new Deriv API (`api.derivws.com`, PAT token, OTP WebSocket). It is separate from V25 Signals and has its own storage keys (`ats.*`).

- **Connect:** paste a Deriv API token (Trade and Read scopes). It's stored only in this phone's localStorage and never in this repo. There's a Demo/Real switch, and Demo is the default. Real asks for confirmation and shows a REAL banner.
- **Dashboard:** "Welcome, <name>" (set with the pencil, because the new API doesn't return the account name), "to the future of auto trading", a DEMO/REAL badge, session P&L, balance, trades, win rate, open contracts, bot status, **Stop all bots**, and ATS-wide session limits.
- **Rise/Fall bot** (CALL/PUT):
  - Direction: our analysis (`predict()` from V25 Signals; waits when it's neutral), always Rise, always Fall, or alternate.
  - Cycle: 1m, 5m, 15m, 30m, 1h, 4h, 1d, custom (minutes/hours, up to 1 day), or 1–10 ticks. The cycle sets the contract duration (minutes or hours; 1d is sent as 24h) and the analysis timeframe: the main candles match the cycle, with ≈4× and ≈24× higher timeframes.
  - **Align to candle boundary** (on by default): each contract opens at a cycle boundary and expires at the next one (`date_expiry`), so consecutive candles can be traded back to back.
  - Martingale (on by default) ×2.1, max 3 steps, reset after a win, with a stake-ladder preview. Stakes are rounded to cents, and the minimum is $0.35.
  - Required limits: session stop-loss, take-profit, maximum losses in a row, maximum stake cap. The bot halts **before** any trade that could break one.
- **Safety:** one contract at a time. If a buy reply is lost, the bot checks `portfolio`/`profit_table` and adopts the contract instead of buying again. Settlement polling survives socket drops. Switching accounts stops the bot.
- **History:** every trade is kept in localStorage, with win rate and P&L overall, by side and for this session, plus CSV export.

## Server mode (v3, default once a key is saved)

The bot can run 24/7 on Mohamed's server (`ats-server`, `/opt/ats`, systemd `ats.service`), **demo account only**. The app becomes the remote control: dashboard, start/stop, Stop all, settings, history and win rate all come from the server's HTTPS API (`https://ats.2-29-170-227.sslip.io`, Let's Encrypt via Caddy).

- Account (top right) → **Server · 24/7** → enter the one-time pairing code (or the server key) once. It is kept only in this phone's localStorage (never in this repo). Wrong keys are locked out on the server.
- The server checks the account is demo before every bot session (REST account type, demo OTP endpoint, login id) and refuses otherwise. It never trades real money.
- State, settings, history and session P&L are saved on the server and survive restarts; an open contract is settled and martingale continues at the right step.
- Balance is the whole demo account; ATS P&L and win rate count only ATS contracts.
- **This phone** (the same switch) is the old local mode, kept as a fallback. In local mode the bot runs in the browser, so iPhone pauses it when the app is backgrounded or the screen locks.

Tests: `node tests/ats-engine.test.js`.
