# Signal log schema (schema_version 2)

One JSON object per signal. `logger/data/signals.json` is an array of these; `signals.csv` has the flat columns below plus a `json` column holding the full record (used for lossless import).

| field | type | meaning |
|---|---|---|
| id | string | `<symbol>-<issued_epoch>-<type initial><rand>` |
| schema_version | int | 2 |
| signal_type | `hourly` \| `manual` \| `bootstrap` | hourly = logger at each hour boundary; manual = "Predict now" button; bootstrap = pipeline test written at logger start, **excluded from all stats** |
| source | `logger` \| `browser` | who wrote it |
| symbol | string | e.g. `1HZ25V` |
| issued_epoch / issued_utc / issued_bahrain | int / ISO / `YYYY-MM-DD HH:MM:SS +03:00` | signal time (hourly signals are stamped exactly at xx:00:00) |
| issued_actual_utc | ISO | logger only: wall-clock time the record was written (≈1.5 s after the boundary) |
| hour_bahrain | 0-23 | hour of day, Asia/Bahrain (UTC+3) |
| timeframe | `1h` | prediction horizon |
| duration_sec | 3600 | |
| due_epoch / due_utc / due_bahrain | | grading time = issued + 3600 |
| direction | `buy` \| `sell` \| `neutral` | buy = Rise/UP, sell = Fall/DOWN, neutral = score inside the dead zone (logged, never counted in hit rate) |
| confidence | number 50-80 | model confidence % (heuristic, not a calibrated probability) |
| score | -1..1 | weighted sum of votes |
| price_at_signal | number | last live tick at issue time |
| target_zone {low, high, basis} | | ATR(14, 1h)-based zone: buy = entry+0.25..1.0 ATR, sell mirrored, neutral = ±0.5 ATR |
| sr {nearest_level, nearest_type, nearest_touches, nearest_strength, distance_abs, distance_pct, distance_atr, zone} | | nearest S/R level from 1h+4h swing-pivot clusters; zone = `near-level` if distance ≤ 0.5×ATR(1h) else `mid-range` |
| regime {label, rv_ann_pct, rv_avg_ann_pct, ratio, atr_1h} | | realized vol of last 60 1-min returns vs its ~16h rolling average; ratio < 0.85 = low, > 1.15 = high, else normal |
| indicators {ema20, ema50, ema200, ema50_slope_atr, rsi14, macd, macd_signal, macd_hist, macd_hist_prev, bb_upper, bb_mid, bb_lower, bb_pctb, bb_width, bb_squeeze, atr14_1h} | | 1h-candle indicator snapshot |
| structure {1d, 4h, 1h, 15m} | string | swing structure label per timeframe (HH/HL, LH/LL, …) |
| votes {structure, sr, ema, rsi, macd, bb, hour} | -1..1 each | per-input vote |
| weights | object | weights used (structure .30, sr .25, ema .15, macd .10, rsi .08, bb .07, hour .05) |
| reasons | string[3] | top 3 plain-language reasons |
| edge_status | string | `untested`, or `edge-candidate (<slice>)` if that hour/regime/zone slice has passed the edge test at issue time |
| status | `open` \| `graded` \| `missed` | `missed` = hourly signal not issued within 60s of the hour boundary (no catch-up price). Excluded from stats. |
| outcome_price / outcome_epoch / outcome_utc / outcome_bahrain | | first tick at/after due_epoch |
| move_abs / move_pct | | outcome − entry |
| in_target_zone | bool | outcome landed in the target zone |
| result | `win` \| `loss` \| `tie` \| `no_call` \| null | no_call for neutral |
| note | string | bootstrap, missed, or late-entry annotation |
| late | bool | true if the hourly was issued more than 60s after the hour boundary |
| excluded_from_stats | bool | true for bootstrap, missed, and late entries |
| reason | string | why a signal was missed or marked late |
| issued_actual_utc | string | wall-clock write time (may be later than issued_utc for historical late rows) |
| demo_trade {status, test, contract_type, stake, contract_id, buy_price, payout, profit, result, entry_spot, exit_spot, placed_utc, settled_utc, account_type, account_prefix, reason} | object \| absent | Deriv **demo** Rise/Fall contract placed by the box logger for an on-time hourly buy/sell (CALL for buy, PUT for sell, 1h, stake from `logger/demo-config.json`). status = `open` \| `settled` \| `skipped` (guard: kill switch, max open, daily loss cap, disabled) \| `error`. profit is Deriv's settled profit from `proposal_open_contract`. Never present on neutral, missed, late, manual or bootstrap rows. Additive field: does not change stats. |

Edge-candidate rule: hit rate ≥ 55 %, n ≥ 50, one-sided exact binomial p < 0.05 vs 50 %. Stats exclude bootstrap, missed, late, `excluded_from_stats`, neutral and ties.

### Demo status file (`data/demo.json`)
Sanitized, published for the phone: `configured, app_id_configured, connected, verified_demo, account_type, account_prefix` (first 4 chars only), `currency, balance, enabled, kill_switch, stake, daily_loss_cap, max_open, today_pnl, open_trades[], recent[], totals {settled, wins, net}, last_error, last_reset`. Never contains the token, OTP or full login id.
