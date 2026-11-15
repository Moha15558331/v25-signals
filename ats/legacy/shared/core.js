/* V25 Signal core: shared by the browser app and the Node headless logger.
 * Plain script (no build). Browser: window.V25Core. Node: require('./core.js').
 * Public market data only. This code never places trades and needs no token. */
(function (root) {
  'use strict';
  const SCHEMA_VERSION = 2;
  const ENDPOINTS = [
    'wss://api.derivws.com/trading/v1/options/ws/public',      // new public API (verified working Nov 2026)
    'wss://ws.derivws.com/websockets/v3?app_id=1089',           // legacy fallback
  ];
  const SYMBOLS = {
    '1HZ25V': 'Volatility 25 (1s)', 'R_25': 'Volatility 25', '1HZ10V': 'Volatility 10 (1s)',
    '1HZ75V': 'Volatility 75 (1s)', 'R_75': 'Volatility 75', 'JD10': 'Jump 10',
  };
  const TF = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
  const WEIGHTS = { structure: 0.30, sr: 0.25, ema: 0.15, macd: 0.10, rsi: 0.08, bb: 0.07, hour: 0.05 };
  const DEAD_ZONE = 0.15;            // |score| below this => NEUTRAL
  const EDGE = { minRate: 0.55, minN: 50, maxP: 0.05 };
  const NEAR_ATR = 0.5;              // within 0.5 x ATR(1h) of a level => near-level
  const BAHRAIN_OFFSET = 3 * 3600;   // Asia/Bahrain = UTC+3, no DST

  // ---------- helpers ----------
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r = (x, d = 2) => (x == null || !isFinite(x)) ? null : Math.round(x * 10 ** d) / 10 ** d;
  const pad = n => String(n).padStart(2, '0');
  function fmtUTC(ep) { const d = new Date(ep * 1000); return d.toISOString().replace('.000Z', 'Z'); }
  function fmtBahrain(ep) {
    const d = new Date((ep + BAHRAIN_OFFSET) * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +03:00`;
  }
  const hourBahrain = ep => new Date((ep + BAHRAIN_OFFSET) * 1000).getUTCHours();

  // ---------- indicators ----------
  function ema(vals, p) { const k = 2 / (p + 1); const out = []; let e;
    vals.forEach((v, i) => { e = i === 0 ? v : v * k + e * (1 - k); out.push(i < p - 1 ? null : e); }); return out; }
  function sma(vals, p) { const out = []; let s = 0;
    vals.forEach((v, i) => { s += v; if (i >= p) s -= vals[i - p]; out.push(i >= p - 1 ? s / p : null); }); return out; }
  function rsi(vals, p = 14) { const out = Array(vals.length).fill(null); let g = 0, l = 0;
    for (let i = 1; i < vals.length; i++) { const ch = vals[i] - vals[i - 1]; const up = Math.max(ch, 0), dn = Math.max(-ch, 0);
      if (i <= p) { g += up; l += dn; if (i === p) { g /= p; l /= p; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
      else { g = (g * (p - 1) + up) / p; l = (l * (p - 1) + dn) / p; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
    return out; }
  function macd(vals, f = 12, s = 26, sig = 9) { const ef = ema(vals, f), es = ema(vals, s);
    const line = vals.map((_, i) => ef[i] != null && es[i] != null ? ef[i] - es[i] : null);
    const start = line.findIndex(x => x != null); const sigArr = Array(vals.length).fill(null);
    if (start >= 0) { const e = ema(line.slice(start), sig); e.forEach((v, i) => sigArr[start + i] = v); }
    return line.map((m, i) => ({ macd: m, signal: sigArr[i], hist: m != null && sigArr[i] != null ? m - sigArr[i] : null })); }
  function bollinger(vals, p = 20, k = 2) { const m = sma(vals, p);
    return vals.map((v, i) => { if (m[i] == null) return null; let s = 0; for (let j = i - p + 1; j <= i; j++) s += (vals[j] - m[i]) ** 2;
      const sd = Math.sqrt(s / p), up = m[i] + k * sd, lo = m[i] - k * sd;
      return { upper: up, mid: m[i], lower: lo, pctB: (v - lo) / (up - lo || 1), width: (up - lo) / m[i] }; }); }
  function atr(c, p = 14) { const tr = c.map((x, i) => i === 0 ? x.high - x.low :
      Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close)));
    const out = []; let a; tr.forEach((t, i) => { a = i < p ? (i === 0 ? t : (a * i + t) / (i + 1)) : (a * (p - 1) + t) / p; out.push(a); }); return out; }

  // ---------- swing pivots, structure, S/R ----------
  function pivots(c, L = 3, R = 3) { const hi = [], lo = [];
    for (let i = L; i < c.length - R; i++) { let isH = true, isL = true;
      for (let j = i - L; j <= i + R; j++) { if (j === i) continue; if (c[j].high >= c[i].high) isH = false; if (c[j].low <= c[i].low) isL = false; }
      if (isH) hi.push({ i, epoch: c[i].epoch, price: c[i].high }); if (isL) lo.push({ i, epoch: c[i].epoch, price: c[i].low }); }
    return { hi, lo }; }
  function structure(c) { const { hi, lo } = pivots(c, 3, 3); if (hi.length < 2 || lo.length < 2) return { vote: 0, label: 'insufficient pivots' };
    const hh = hi.at(-1).price > hi.at(-2).price, hl = lo.at(-1).price > lo.at(-2).price;
    const vote = (hh ? 0.5 : -0.5) + (hl ? 0.5 : -0.5);
    const label = vote > 0 ? 'HH/HL (uptrend)' : vote < 0 ? 'LH/LL (downtrend)' : (hh ? 'HH/LL (expanding)' : 'LH/HL (contracting)');
    return { vote, label }; }
  /** Cluster swing pivots into S/R levels. tol = clustering tolerance in price (default 0.35*ATR). */
  function srLevels(c, opts = {}) { if (!c || c.length < 20) return [];
    const a = atr(c).at(-1); const tol = opts.tol || a * 0.35; const { hi, lo } = pivots(c, opts.L || 3, opts.R || 3);
    const pts = hi.map(p => ({ ...p, kind: 'H' })).concat(lo.map(p => ({ ...p, kind: 'L' }))).sort((x, y) => x.price - y.price);
    const clusters = []; for (const p of pts) { const cl = clusters.at(-1);
      if (cl && p.price - cl.mean <= tol) { cl.pts.push(p); cl.mean = cl.pts.reduce((s, q) => s + q.price, 0) / cl.pts.length; }
      else clusters.push({ pts: [p], mean: p.price }); }
    const last = c.at(-1).close, n = c.length;
    const lv = clusters.map(cl => { const touches = cl.pts.length; const recency = Math.max(...cl.pts.map(p => p.i)) / n;
      return { price: cl.mean, touches, recency: r(recency, 2), last_touch: Math.max(...cl.pts.map(p => p.epoch)),
        type: cl.mean >= last ? 'resistance' : 'support', score: touches + recency }; });
    lv.sort((x, y) => y.score - x.score);
    return lv.slice(0, opts.max || 8).map(l => ({ ...l, strength: l.touches >= 4 ? 'strong' : l.touches >= 2 ? 'medium' : 'weak' })); }

  // ---------- volatility regime ----------
  function regime(m1) { // m1: 1-minute candles (>= ~300)
    const lr = []; for (let i = 1; i < m1.length; i++) lr.push(Math.log(m1[i].close / m1[i - 1].close));
    const sd = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
    if (lr.length < 120) return { label: 'unknown', rv: null, rv_avg: null, ratio: null };
    const rv = sd(lr.slice(-60)); const w = []; for (let i = 60; i <= lr.length; i += 15) w.push(sd(lr.slice(i - 60, i)));
    const avg = w.reduce((s, x) => s + x, 0) / w.length; const ratio = rv / avg;
    const ann = x => x * Math.sqrt(60 * 24 * 365) * 100; // annualised %, for display (V25 nominal = 25%)
    return { label: ratio < 0.85 ? 'low' : ratio > 1.15 ? 'high' : 'normal', rv_ann_pct: r(ann(rv), 2), rv_avg_ann_pct: r(ann(avg), 2), ratio: r(ratio, 3) }; }

  // ---------- statistics ----------
  function lnFact(n) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }
  /** One-sided exact binomial P(X >= k | n, 0.5) */
  function binomP(k, n) { if (n === 0) return 1; const lf = [0]; for (let i = 1; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i);
    let p = 0; for (let i = k; i <= n; i++) p += Math.exp(lf[n] - lf[i] - lf[n - i] - n * Math.LN2); return Math.min(1, p); }
  function wilson(k, n, z = 1.96) { if (!n) return [null, null]; const ph = k / n, d = 1 + z * z / n;
    const c = (ph + z * z / (2 * n)) / d, h = z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)) / d; return [c - h, c + h]; }
  function sliceStats(rows) { const n = rows.length, k = rows.filter(x => x.result === 'win').length;
    const [lo, hi] = wilson(k, n); const p = binomP(k, n); const rate = n ? k / n : null;
    const edge = n >= EDGE.minN && rate >= EDGE.minRate && p < EDGE.maxP;
    return { n, wins: k, losses: n - k, rate, ci_low: lo, ci_high: hi, p_value: p, edge_candidate: edge }; }
  function isExcludedFromStats(x) {
    return !x || x.signal_type === 'bootstrap' || x.status === 'missed' || x.late === true || x.excluded_from_stats === true;
  }
  const gradedDirectional = log => log.filter(x => x.status === 'graded' && (x.result === 'win' || x.result === 'loss') && !isExcludedFromStats(x));
  const confBucket = c => c < 55 ? '50-55' : c < 60 ? '55-60' : c < 65 ? '60-65' : '65+';
  function stats(log) { const g = gradedDirectional(log); const by = (key) => { const m = {};
      g.forEach(x => { const kk = key(x); (m[kk] = m[kk] || []).push(x); });
      return Object.fromEntries(Object.entries(m).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([kk, v]) => [kk, sliceStats(v)])); };
    return { overall: sliceStats(g), by_hour: by(x => pad(x.hour_bahrain) + ':00'), by_regime: by(x => x.regime.label),
      by_zone: by(x => x.sr.zone), by_confidence: by(x => confBucket(x.confidence)), by_direction: by(x => x.direction),
      by_type: by(x => x.signal_type), total_logged: log.length, open: log.filter(x => x.status === 'open').length,
      neutral: log.filter(x => x.direction === 'neutral' && !isExcludedFromStats(x)).length,
      missed: log.filter(x => x.status === 'missed').length,
      late: log.filter(x => x.status !== 'missed' && x.signal_type !== 'bootstrap' && (x.late === true || x.excluded_from_stats === true)).length,
      criteria: EDGE }; }
  function edgeLabel(sig, st) { if (!st) return 'untested'; const hits = [];
    const chk = (name, s) => { if (s && s.edge_candidate) hits.push(name); };
    chk('hour ' + pad(sig.hour_bahrain), st.by_hour[pad(sig.hour_bahrain) + ':00']); chk('regime ' + sig.regime.label, st.by_regime[sig.regime.label]);
    chk(sig.sr.zone, st.by_zone[sig.sr.zone]); return hits.length ? 'edge-candidate (' + hits.join(', ') + ')' : 'untested'; }

  // ---------- prediction ----------
  /** data: {symbol, price, epoch, candles:{'1d','4h','1h','15m','1m'}}; opts: {signal_type, source, stats} */
  function predict(data, opts = {}) {
    const C = data.candles, h1 = C['1h'], close1h = h1.map(x => x.close); const price = data.price ?? h1.at(-1).close;
    const epoch = data.epoch ?? Math.floor(Date.now() / 1000); const reasons = []; const votes = {};
    // 1. Multi-TF swing structure (higher TFs weigh more)
    const tfw = { '1d': 0.35, '4h': 0.30, '1h': 0.20, '15m': 0.15 }; let sv = 0; const st = {};
    for (const [tf, w] of Object.entries(tfw)) { const s = C[tf] && C[tf].length > 10 ? structure(C[tf]) : { vote: 0, label: 'no data' }; st[tf] = s.label; sv += w * s.vote; }
    votes.structure = r(sv, 3); reasons.push({ w: Math.abs(sv) * WEIGHTS.structure, t: `Swing structure ${sv > 0 ? 'bullish' : sv < 0 ? 'bearish' : 'mixed'} (D: ${st['1d']}, 4h: ${st['4h']}, 1h: ${st['1h']}, 15m: ${st['15m']})` });
    // 2. Nearest S/R (levels from 1h + 4h pivots)
    const A = atr(h1).at(-1); const levels = srLevels(h1, { max: 10 }).concat(srLevels(C['4h'] || [], { max: 6 }).map(l => ({ ...l, tf: '4h' })));
    let nearest = null; for (const l of levels) { const d = Math.abs(l.price - price); if (!nearest || d < nearest.d) nearest = { ...l, d }; }
    let srv = 0, zone = 'mid-range';
    if (nearest) { const dAtr = nearest.d / A; const isSup = nearest.price <= price; const sf = clamp(nearest.touches / 4, 0.25, 1);
      if (dAtr <= NEAR_ATR) { zone = 'near-level'; srv = (isSup ? 1 : -1) * sf * (1 - dAtr / NEAR_ATR * 0.5);
        reasons.push({ w: Math.abs(srv) * WEIGHTS.sr, t: `Price is ${r(dAtr, 2)}×ATR from ${isSup ? 'support' : 'resistance'} ${r(nearest.price)} (${nearest.touches} touches, ${nearest.strength}), expecting a ${isSup ? 'bounce up' : 'rejection down'}` }); }
      else reasons.push({ w: 0.01, t: `Mid-range: nearest level ${r(nearest.price)} is ${r(dAtr, 2)}×ATR away (no S/R vote)` }); }
    votes.sr = r(srv, 3);
    // 3. EMA 20/50/200 position + slope (1h)
    const e20 = ema(close1h, 20), e50 = ema(close1h, 50), e200 = ema(close1h, 200);
    const E20 = e20.at(-1), E50 = e50.at(-1), E200 = e200.at(-1); const slope50 = (E50 - e50.at(-6)) / A; // ATRs per 5h
    let pos = 0; if (E200 != null) { pos = (price > E20 ? 1 : -1) * 0.34 + (E20 > E50 ? 1 : -1) * 0.33 + (E50 > E200 ? 1 : -1) * 0.33; }
    else pos = (price > E20 ? 0.5 : -0.5) + (E20 > E50 ? 0.5 : -0.5);
    const ev = clamp(0.6 * pos + 0.4 * clamp(slope50, -1, 1), -1, 1); votes.ema = r(ev, 3);
    reasons.push({ w: Math.abs(ev) * WEIGHTS.ema, t: `EMAs ${ev > 0 ? 'bullish' : 'bearish'}: price ${price > E20 ? '>' : '<'} EMA20, EMA20 ${E20 > E50 ? '>' : '<'} EMA50${E200 != null ? `, EMA50 ${E50 > E200 ? '>' : '<'} EMA200` : ''}; EMA50 slope ${r(slope50, 2)} ATR/5h` });
    // 4. RSI(14) 1h
    const R = rsi(close1h).at(-1); const rv = R > 70 ? -0.6 : R < 30 ? 0.6 : clamp((R - 50) / 25, -1, 1) * 0.6; votes.rsi = r(rv, 3);
    reasons.push({ w: Math.abs(rv) * WEIGHTS.rsi, t: R > 70 ? `RSI ${r(R, 1)} overbought` : R < 30 ? `RSI ${r(R, 1)} oversold` : `RSI ${r(R, 1)} ${R > 50 ? 'above' : 'below'} 50 (momentum)` });
    // 5. MACD(12,26,9) histogram sign + slope
    const M = macd(close1h); const m = M.at(-1), mp = M.at(-2); const hs = Math.sign(m.hist), hsl = Math.sign(m.hist - mp.hist);
    const mv = 0.6 * hs + 0.4 * hsl; votes.macd = r(mv, 3);
    reasons.push({ w: Math.abs(mv) * WEIGHTS.macd, t: `MACD histogram ${hs > 0 ? 'positive' : 'negative'} and ${hsl > 0 ? 'rising' : 'falling'}` });
    // 6. Bollinger(20,2) %B + squeeze
    const B = bollinger(close1h); const b = B.at(-1); const widths = B.filter(Boolean).slice(-120).map(x => x.width).sort((x, y) => x - y);
    const squeeze = b.width <= widths[Math.floor(widths.length * 0.2)]; const bv = b.pctB > 1 ? -0.6 : b.pctB < 0 ? 0.6 : clamp(-(b.pctB - 0.5), -0.5, 0.5);
    votes.bb = r(bv, 3); reasons.push({ w: Math.abs(bv) * WEIGHTS.bb, t: `Bollinger %B ${r(b.pctB, 2)}${squeeze ? ' (bandwidth squeeze: breakout risk)' : ''}` });
    // 7. Hour of day (Bahrain): empirical, only once that hour has data
    const hb = hourBahrain(epoch); let hv = 0; // historical up-fraction of 1h candles that open at this Bahrain hour
    const same = h1.slice(0, -1).filter(x => hourBahrain(x.epoch) === hb); const upF = same.length ? same.filter(x => x.close > x.open).length / same.length : 0.5;
    if (same.length >= 30) hv = clamp((upF - 0.5) * 4, -1, 1); votes.hour = r(hv, 3);
    reasons.push({ w: Math.abs(hv) * WEIGHTS.hour, t: `Hour ${pad(hb)}:00 Bahrain: ${r(upF * 100, 1)}% of the last ${same.length} candles for this hour closed up` });
    // regime
    const reg = regime(C['1m'] || []);
    // combine
    let score = 0; for (const k in WEIGHTS) score += WEIGHTS[k] * (votes[k] || 0); score = clamp(score, -1, 1);
    const direction = Math.abs(score) < DEAD_ZONE ? 'neutral' : score > 0 ? 'buy' : 'sell';
    const regF = reg.label === 'high' ? 0.75 : reg.label === 'low' ? 1.0 : 0.9;
    const confidence = direction === 'neutral' ? 50 : r(clamp(50 + Math.abs(score) * 35 * regF * (squeeze ? 0.9 : 1), 50, 80), 1);
    const tz = direction === 'buy' ? [price + 0.25 * A, price + 1.0 * A] : direction === 'sell' ? [price - 1.0 * A, price - 0.25 * A] : [price - 0.5 * A, price + 0.5 * A];
    if (reg.label !== 'unknown') reasons.push({ w: 0.001, t: `Volatility regime ${reg.label} (realized ${reg.rv_ann_pct}% vs avg ${reg.rv_avg_ann_pct}% ann.)` });
    reasons.sort((x, y) => y.w - x.w);
    const sig = {
      schema_version: SCHEMA_VERSION, id: `${data.symbol}-${epoch}-${(opts.signal_type || 'manual')[0]}${Math.random().toString(36).slice(2, 6)}`,
      signal_type: opts.signal_type || 'manual', source: opts.source || 'browser', symbol: data.symbol,
      issued_epoch: epoch, issued_utc: fmtUTC(epoch), issued_bahrain: fmtBahrain(epoch), hour_bahrain: hb,
      timeframe: '1h', duration_sec: 3600, due_epoch: epoch + 3600, due_utc: fmtUTC(epoch + 3600), due_bahrain: fmtBahrain(epoch + 3600),
      direction, confidence, score: r(score, 4), price_at_signal: price,
      target_zone: { low: r(tz[0]), high: r(tz[1]), basis: 'ATR(14,1h)' },
      sr: { nearest_level: nearest ? r(nearest.price) : null, nearest_type: nearest ? (nearest.price <= price ? 'support' : 'resistance') : null,
        nearest_touches: nearest ? nearest.touches : null, nearest_strength: nearest ? nearest.strength : null,
        distance_abs: nearest ? r(nearest.d) : null, distance_pct: nearest ? r(nearest.d / price * 100, 4) : null,
        distance_atr: nearest ? r(nearest.d / A, 3) : null, zone },
      regime: { label: reg.label, rv_ann_pct: reg.rv_ann_pct, rv_avg_ann_pct: reg.rv_avg_ann_pct, ratio: reg.ratio, atr_1h: r(A) },
      indicators: { ema20: r(E20), ema50: r(E50), ema200: r(E200), ema50_slope_atr: r(slope50, 3), rsi14: r(R, 2),
        macd: r(m.macd, 3), macd_signal: r(m.signal, 3), macd_hist: r(m.hist, 3), macd_hist_prev: r(mp.hist, 3),
        bb_upper: r(b.upper), bb_mid: r(b.mid), bb_lower: r(b.lower), bb_pctb: r(b.pctB, 3), bb_width: r(b.width, 5), bb_squeeze: squeeze, atr14_1h: r(A) },
      structure: st, votes, weights: WEIGHTS, reasons: reasons.slice(0, 3).map(x => x.t),
      edge_status: 'untested', status: direction === 'neutral' ? 'open' : 'open',
      outcome_price: null, outcome_epoch: null, outcome_utc: null, outcome_bahrain: null, move_abs: null, move_pct: null, in_target_zone: null, result: null,
    };
    sig.edge_status = edgeLabel(sig, opts.stats);
    return sig; }

  /** Grade a signal given the price at/just before due_epoch. */
  function grade(sig, outPrice, outEpoch) { const mv = outPrice - sig.price_at_signal;
    sig.outcome_price = outPrice; sig.outcome_epoch = outEpoch; sig.outcome_utc = fmtUTC(outEpoch); sig.outcome_bahrain = fmtBahrain(outEpoch);
    sig.move_abs = r(mv); sig.move_pct = r(mv / sig.price_at_signal * 100, 4); sig.status = 'graded';
    sig.in_target_zone = outPrice >= sig.target_zone.low && outPrice <= sig.target_zone.high;
    sig.result = sig.direction === 'neutral' ? 'no_call' : mv === 0 ? 'tie' : ((mv > 0) === (sig.direction === 'buy') ? 'win' : 'loss');
    return sig; }

  // ---------- paper P&L ----------
  function paperCurve(log, { balance = 50, stake = 1, payoutPct = 95 } = {}) { let b = balance; const pts = [{ epoch: null, balance: b }];
    gradedDirectional(log).sort((a, c) => a.due_epoch - c.due_epoch).forEach(x => { b += x.result === 'win' ? stake * payoutPct / 100 : -stake; pts.push({ epoch: x.outcome_epoch, balance: r(b), id: x.id }); });
    return pts; }

  // ---------- CSV ----------
  const CSV_COLS = ['id', 'schema_version', 'signal_type', 'source', 'symbol', 'issued_epoch', 'issued_utc', 'issued_bahrain', 'hour_bahrain', 'timeframe', 'duration_sec',
    'due_epoch', 'direction', 'confidence', 'score', 'price_at_signal', 'target_zone.low', 'target_zone.high',
    'sr.nearest_level', 'sr.nearest_type', 'sr.nearest_touches', 'sr.distance_abs', 'sr.distance_pct', 'sr.distance_atr', 'sr.zone',
    'regime.label', 'regime.rv_ann_pct', 'regime.rv_avg_ann_pct', 'regime.ratio',
    'indicators.ema20', 'indicators.ema50', 'indicators.ema200', 'indicators.rsi14', 'indicators.macd_hist', 'indicators.bb_pctb', 'indicators.bb_width', 'indicators.bb_squeeze', 'indicators.atr14_1h',
    'votes.structure', 'votes.sr', 'votes.ema', 'votes.rsi', 'votes.macd', 'votes.bb', 'votes.hour', 'edge_status', 'status',
    'outcome_price', 'outcome_epoch', 'outcome_utc', 'outcome_bahrain', 'move_abs', 'move_pct', 'in_target_zone', 'result',
    'late', 'excluded_from_stats', 'reason', 'issued_actual_utc', 'note',
    'demo_trade.status', 'demo_trade.contract_type', 'demo_trade.contract_id', 'demo_trade.buy_price', 'demo_trade.payout', 'demo_trade.profit', 'demo_trade.result', 'reasons', 'json'];
  const get = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const esc = v => { if (v == null) return ''; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function toCSV(log) { return [CSV_COLS.join(',')].concat(log.map(x => CSV_COLS.map(c => c === 'json' ? esc(JSON.stringify(x)) : c === 'reasons' ? esc((x.reasons || []).join(' | ')) : esc(get(x, c))).join(','))).join('\n'); }
  function parseCSV(text) { const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) { const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (ch !== '\r') f += ch; }
    if (f || row.length) { row.push(f); rows.push(row); }
    const hdr = rows.shift() || []; const ji = hdr.indexOf('json');
    return rows.filter(r_ => r_.length > ji && ji >= 0).map(r_ => JSON.parse(r_[ji])); }
  function mergeLogs(a, b) {
    const m = new Map();
    const put = x => {
      const o = m.get(x.id);
      if (!o) { m.set(x.id, x); return; }
      const xWins = (o.status !== 'graded' && (x.status === 'graded' || x.status === 'missed'))
        || (x.late && !o.late) || (x.excluded_from_stats && !o.excluded_from_stats);
      const base = xWins ? { ...o, ...x } : { ...x, ...o };
      if (o.late || x.late) base.late = true;
      if (o.excluded_from_stats || x.excluded_from_stats) base.excluded_from_stats = true;
      if (!base.reason) base.reason = x.reason || o.reason;
      if (!base.note) base.note = x.note || o.note;
      const rank = d => !d ? 0 : ({ settled: 4, open: 3, error: 2, skipped: 1 }[d.status] || 1);
      if (o.demo_trade || x.demo_trade) base.demo_trade = rank(x.demo_trade) >= rank(o.demo_trade) ? x.demo_trade : o.demo_trade;
      m.set(x.id, base);
    };
    a.forEach(put); b.forEach(put);
    return [...m.values()].sort((x, y) => x.issued_epoch - y.issued_epoch);
  }

  // ---------- Deriv WebSocket client (public data, no token) ----------
  class DerivClient {
    constructor({ endpoints = ENDPOINTS, WS = root.WebSocket, onStatus = () => {}, log = () => {} } = {}) {
      Object.assign(this, { endpoints, WS, onStatus, log });
      this.ep = 0; this.reqId = 1; this.pending = new Map(); this.subs = new Map();
      this.retry = 0; this.closed = false; this.gen = 0; this._reconnecting = false;
      this.lastRecv = 0; this.ping = null; this._pongTimer = null;
      this._openTimer = null; this._reconnectTimer = null; this.ws = null;
    }
    connect() { return new Promise((resolve) => { this._resolveOpen = resolve; this._open(); }); }
    _killSocket(ws) {
      if (!ws) return;
      try { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = function () {}; } catch (e) {}
      try { if (typeof ws.terminate === 'function') ws.terminate(); else ws.close(); } catch (e) {}
    }
    _failPending(msg) {
      for (const p of this.pending.values()) p.rej({ message: msg });
      this.pending.clear();
    }
    _clearHeartbeat() {
      clearInterval(this.ping); clearTimeout(this._pongTimer);
      this.ping = null; this._pongTimer = null;
    }
    _armPongTimeout(gen) {
      clearTimeout(this._pongTimer);
      this._pongTimer = setTimeout(() => {
        if (gen !== this.gen || this.closed) return;
        this.forceReconnect('ping/pong timeout, no socket message for 20s');
      }, 20000);
    }
    _startPing(gen) {
      this._clearHeartbeat();
      this._armPongTimeout(gen);
      this.ping = setInterval(() => {
        if (gen !== this.gen || this.closed) return;
        const age = Date.now() - this.lastRecv;
        if (age > 20000) {
          this.forceReconnect('ping/pong timeout, last message ' + Math.round(age / 1000) + 's ago');
          return;
        }
        this.send({ ping: 1 }).catch(() => {});
      }, 15000);
    }
    _open() {
      if (this.closed) return;
      this._reconnecting = false;
      const prev = this.ws; this.ws = null; this._killSocket(prev);
      const gen = ++this.gen;
      const url = this.endpoints[this.ep % this.endpoints.length];
      this.url = url; this.onStatus('connecting', url);
      let ws;
      try { ws = new this.WS(url); } catch (e) { return this._reconnect(); }
      this.ws = ws; let opened = false;
      const to = setTimeout(() => {
        if (gen !== this.gen) return;
        if (!opened) { this.log('connect timeout', url); this.forceReconnect('connect timeout'); }
      }, 8000);
      this._openTimer = to;
      ws.onopen = () => {
        if (gen !== this.gen) return;
        opened = true; clearTimeout(to); this.retry = 0; this.lastRecv = Date.now();
        this.onStatus('open', url); this._startPing(gen);
        for (const s of this.subs.values()) this._raw(s.req);
        if (this._resolveOpen) { this._resolveOpen(); this._resolveOpen = null; }
      };
      ws.onmessage = ev => {
        if (gen !== this.gen) return;
        this.lastRecv = Date.now(); this._armPongTimeout(gen);
        let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (d.req_id && this.pending.has(d.req_id)) {
          const p = this.pending.get(d.req_id); this.pending.delete(d.req_id);
          d.error ? p.rej(d.error) : p.res(d);
        }
        const key = d.echo_req && d.echo_req.passthrough && d.echo_req.passthrough.sub;
        if (key && this.subs.has(key) && !d.error) this.subs.get(key).cb(d);
      };
      ws.onclose = () => {
        if (gen !== this.gen) return;
        clearTimeout(to); this._clearHeartbeat();
        if (!opened) this.ep++;
        this.onStatus('closed', url);
        this._failPending('socket closed');
        if (!this.closed) this._reconnect();
      };
      ws.onerror = () => {};
    }
    _reconnect() {
      if (this.closed || this._reconnecting) return;
      this._reconnecting = true;
      const d = Math.min(30000, 1000 * 2 ** this.retry++);
      this.onStatus('reconnecting', 'in ' + (d / 1000) + 's');
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = setTimeout(() => { this._reconnecting = false; this._open(); }, d);
    }
    /** Tear down the current socket immediately (terminate if available) and reconnect.
     *  Does not wait for onclose — half-open sockets often never fire it. */
    forceReconnect(reason) {
      this.log('forceReconnect', reason || '');
      const ws = this.ws; this.ws = null;
      this.gen++; this._clearHeartbeat();
      clearTimeout(this._openTimer); clearTimeout(this._reconnectTimer);
      this._reconnecting = false;
      this._failPending('socket force-reconnect: ' + (reason || ''));
      this._killSocket(ws);
      this.onStatus('closed', reason || '');
      if (!this.closed) this._reconnect();
    }
    _raw(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
    send(o) { return new Promise((res, rej) => { const id = this.reqId++; this.pending.set(id, { res, rej });
      if (!this.ws || this.ws.readyState !== 1) { this.pending.delete(id); return rej({ message: 'not connected' }); }
      this.ws.send(JSON.stringify({ ...o, req_id: id })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej({ message: 'timeout' }); } }, 20000); }); }
    subscribe(key, req, cb) { const full = { ...req, subscribe: 1, passthrough: { sub: key } }; this.subs.set(key, { req: full, cb });
      if (this.ws && this.ws.readyState === 1) this._raw(full); }
    unsubscribe(key) { this.subs.delete(key); this.send({ forget_all: ['ticks', 'candles'] }).catch(() => {}); }
    async candles(symbol, tf, count = 1000) { const d = await this.send({ ticks_history: symbol, style: 'candles', granularity: TF[tf] || tf, count, end: 'latest' });
      return d.candles.map(c => ({ epoch: +c.epoch, open: +c.open, high: +c.high, low: +c.low, close: +c.close })); }
    /** First tick at or after `epoch` (the price when the 1h window closes). */
    async priceAt(symbol, epoch) { const d = await this.send({ ticks_history: symbol, style: 'ticks', start: epoch, end: epoch + 15, count: 30 });
      const t = d.history.times.map(Number), p = d.history.prices.map(Number); let i = t.findIndex(x => x >= epoch); if (i < 0) i = t.length - 1;
      if (i < 0) throw { message: 'no ticks yet' }; return { price: p[i], epoch: t[i] }; }
    async snapshot(symbol) { const out = {}; for (const tf of ['1d', '4h', '1h', '15m', '1m']) out[tf] = await this.candles(symbol, tf, tf === '1d' ? 300 : 1000); return out; }
    close() {
      this.closed = true; this.gen++;
      this._clearHeartbeat(); clearTimeout(this._reconnectTimer); clearTimeout(this._openTimer);
      this._killSocket(this.ws); this.ws = null;
    }
  }

  const api = { SCHEMA_VERSION, ENDPOINTS, SYMBOLS, TF, WEIGHTS, DEAD_ZONE, EDGE, NEAR_ATR, ema, sma, rsi, macd, bollinger, atr, pivots, structure, srLevels, regime,
    binomP, wilson, sliceStats, stats, edgeLabel, isExcludedFromStats, predict, grade, paperCurve, toCSV, parseCSV, mergeLogs, DerivClient, fmtUTC, fmtBahrain, hourBahrain, confBucket };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.V25Core = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
