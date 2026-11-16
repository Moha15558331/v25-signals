/* ATS engine: pure logic for the Rise/Fall bot on Volatility 25 (1s) (no network, no DOM).
 * Shared by the browser (window.ATSEngine) and Node unit tests (require).
 * Stake ladder, martingale, risk limits, cycle/duration rules and the proposal builder live here. */
(function (root) {
  'use strict';
  const r2 = x => Math.round((+x + Number.EPSILON) * 100) / 100;
  const SYMBOL = '1HZ25V', SYMBOL_NAME = 'Volatility 25 (1s)';
  const MIN_STAKE = 0.35; // Deriv: "stake amount that's at least 0.35" (USD), max 2 decimals

  const BOT = {
    key: 'risefall', name: 'Rise / Fall', short: 'R/F', icon: 'rf',
    desc: 'CALL / PUT on Volatility 25 (1s). Our analysis picks the side. Martingale ×2.1.',
    defaults: { stake: 0.35, cycle: '5m', custom_n: 10, custom_u: 'm', ticks: 5, align: true, direction: 'analysis',
      martingale: true, mg_factor: 2.1, mg_max_steps: 3, mg_reset_win: true,
      session_sl: 6, session_tp: 3, max_consec_losses: 4, max_stake: 3.5,
      // strategy: 'hybrid' = the ATS bot (Differs on the least digit, Over 2 / Under 7 recovery; shared/hybrid.js, server only),
      // 'classic' = the analysis above; 'model10m' = 10-minute neural-net forward test (kept, hidden; server, demo only)
      strategy: 'mult', model_stake: 1, day_tp: 1, day_sl: 2,
      diff_lookback: 100, diff_gap: 2.5, rec_secs: 15, rec_side: 'auto', smart_mg: true,
      ses_on: false, ses_count: 7, ses_tp: 0.5, ses_sl: 2, ses_pause: 60,
      // strategy 'mult' (v4.3, shared/mult.js): Deriv Multipliers, ensemble of every indicator, TP / SL per trade
      m_symbol: '1HZ25V', m_mult: 160, m_stake: 1, m_tp: 0.5, m_sl: 0.5, m_conf: 65, m_maxmin: 0, m_mg: false, m_mg_factor: 2, m_mg_steps: 2, m_max_losses: 8 }
  };
  const STRATEGIES = { mult: 'ATS bot · Multipliers', hybrid: 'ATS bot · Differs + Over/Under recovery', classic: 'Classic analysis', model10m: 'Model test · 10m neural net' };
  /** Effective params for the Model strategy: 10m contracts aligned to the decision grid, flat stake, no martingale,
   *  and the bot's own stop-loss / take-profit become the daily −$day_sl / +$day_tp (reset each Bahrain day). */
  function modelParams(p) {
    return Object.assign({}, p, { strategy: 'model10m', cycle: 'custom', custom_n: 10, custom_u: 'm', align: true, direction: 'analysis',
      martingale: false, stake: +p.model_stake, session_tp: +p.day_tp, session_sl: +p.day_sl });
  }
  const BOT_TYPES = { risefall: BOT };

  /** Round a stake to cents and never below the API minimum. */
  const roundStake = x => Math.max(MIN_STAKE, r2(x));

  // Contract duration rules (contracts_for on 1HZ25V, Nov 2026): CALL/PUT ticks 1t–10t, intraday 15s–1d.
  // Over 24h the API needs end-of-day expiry, so a 1-day cycle is sent as 24h.
  const TICKS = [1, 10];
  const CYCLES = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
  const CYCLE_OPTS = [['1m', '1 minute'], ['5m', '5 minutes'], ['15m', '15 minutes'], ['30m', '30 minutes'], ['1h', '1 hour'], ['4h', '4 hours'], ['1d', '1 day'], ['custom', 'Custom…'], ['ticks', 'Ticks (1–10)']];
  function cycleSec(p) {
    if (!p || p.cycle === 'ticks') return null;
    if (p.cycle === 'custom') return Math.round(+p.custom_n * (p.custom_u === 'h' ? 3600 : 60));
    return CYCLES[p.cycle] || null;
  }
  /** Contract duration for the cycle: ticks, whole hours ('h') or minutes ('m'). */
  function cycleDuration(p) {
    if (p.cycle === 'ticks') return { duration: +p.ticks, duration_unit: 't' };
    const s = cycleSec(p); if (!s) return null;
    return s % 3600 === 0 ? { duration: s / 3600, duration_unit: 'h' } : { duration: Math.round(s / 60), duration_unit: 'm' };
  }
  const cycleLabel = p => p.cycle === 'ticks' ? `${p.ticks} tick${+p.ticks === 1 ? '' : 's'}` : p.cycle === 'custom' ? `${p.custom_n}${p.custom_u}` : p.cycle;

  /* Candle alignment: trades open at a cycle boundary (epoch multiple of the cycle) and expire at the next one.
   * A trade may still start within a short grace window after the boundary (the previous contract settles a
   * second or two after it), so consecutive candles can be traded back to back. */
  const graceSec = sec => Math.max(5, Math.min(60, Math.floor(sec * 0.1)));
  function alignPlan(sec, t) {
    const start = Math.floor(t / sec) * sec, end = start + sec;
    if (t - start <= graceSec(sec) && end - t >= 15) return { now: true, start, date_expiry: end };
    return { now: false, next: end, date_expiry: end + sec };
  }

  // Candle granularities the API serves (all verified on 1HZ25V); analysis TFs are chosen relative to the cycle.
  const GRANS = [60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400];
  const nearestGran = x => GRANS.reduce((a, g) => Math.abs(Math.log(g / x)) < Math.abs(Math.log(a / x)) ? g : a, GRANS[0]);
  /** Map a cycle to the five candle slots predict() reads: '1h' = main TF (= cycle), '4h' ≈ 4× and '1d' ≈ 24× higher,
   *  '15m' ≈ ¼ lower, '1m' = volatility regime (always 1-minute). */
  function analysisTFs(sec) {
    const c = Math.max(60, sec || 60);
    const base = GRANS.filter(g => g <= c).pop();
    return { '1h': base, '4h': Math.max(base, nearestGran(base * 4)), '1d': Math.max(base, nearestGran(base * 24)), '15m': Math.max(60, Math.min(base, nearestGran(base / 4))), '1m': 60 };
  }
  const gLabel = g => g >= 86400 ? g / 86400 + 'd' : g >= 3600 ? g / 3600 + 'h' : g / 60 + 'm';

  /** Martingale stake ladder: step 0 = base stake. raw = unrounded, stake = what is sent (cents, ≥ min). */
  function stakeLadder(p, steps) {
    const n = steps != null ? steps : (p.martingale ? Math.min(+p.mg_max_steps || 0, 10) : 0);
    const out = []; let cum = 0;
    for (let i = 0; i <= n; i++) {
      const raw = +p.stake * Math.pow(p.martingale ? +p.mg_factor : 1, i); const stake = roundStake(raw); cum = r2(cum + stake);
      out.push({ step: i, raw: +raw.toFixed(6), stake, cum, over: p.max_stake != null && stake > +p.max_stake + 1e-9 });
    }
    return out;
  }

  function validateParams(p) {
    const errs = [];
    const num = (k, min, max, label) => { const v = +p[k]; if (!isFinite(v) || v < min || (max != null && v > max)) errs.push(`${label} must be ${max != null ? `${min}–${max}` : `≥ ${min}`}`); };
    num('stake', MIN_STAKE, 1000, 'Stake');
    if (Math.abs(r2(p.stake) - +p.stake) > 1e-9) errs.push('Stake can have at most 2 decimals');
    num('session_sl', 0.01, null, 'Session stop-loss');
    num('session_tp', 0.01, null, 'Take-profit');
    num('max_consec_losses', 1, 50, 'Max losses in a row');
    num('max_stake', MIN_STAKE, 1000, 'Max stake cap');
    if (+p.max_stake < +p.stake) errs.push('Max stake cap must be at least the stake');
    if (+p.stake > +p.session_sl) errs.push('Stake is larger than the session stop-loss');
    if (p.martingale) { num('mg_factor', 1.01, 20, 'Martingale factor'); num('mg_max_steps', 1, 10, 'Martingale max steps'); }
    if (!['analysis', 'up', 'down', 'alternate'].includes(p.direction)) errs.push('Pick a direction mode');
    if (p.strategy != null && !STRATEGIES[p.strategy]) errs.push('Pick a strategy');
    if (p.strategy === 'model10m') {
      num('model_stake', MIN_STAKE, 1000, 'Model stake'); num('day_tp', 0.01, 1000, 'Daily profit lock'); num('day_sl', 0.01, 1000, 'Daily stop');
      if (Math.abs(r2(p.model_stake) - +p.model_stake) > 1e-9) errs.push('Model stake can have at most 2 decimals');
      if (+p.model_stake > +p.day_sl) errs.push('Model stake is larger than the daily stop');
      if (+p.model_stake > +p.max_stake) errs.push('Model stake is above the max stake cap');
    }
    if (p.cycle === 'ticks') { if (!(+p.ticks >= TICKS[0] && +p.ticks <= TICKS[1] && Number.isInteger(+p.ticks))) errs.push(`Ticks must be ${TICKS[0]}–${TICKS[1]}`); }
    else { const s = cycleSec(p); if (!s || s < 60 || s > 86400 || s % 60) errs.push('Cycle must be 1 minute to 1 day (whole minutes)'); }
    return errs;
  }

  /** Martingale + risk state for one bot run. Never returns a stake that could break a limit. */
  class BotRun {
    constructor(params) {
      this.p = Object.assign({}, params);
      this.step = 0; this.pnl = 0; this.trades = 0; this.wins = 0; this.losses = 0; this.consecLosses = 0;
      this.haltReason = null; this.lastStake = null;
    }
    stakeForStep(step) { const p = this.p; return roundStake(+p.stake * Math.pow(p.martingale ? +p.mg_factor : 1, step)); }
    /** Stake for the next contract, or null (and haltReason set) if any limit forbids trading. */
    nextStake() {
      if (this.haltReason) return null;
      if (this.check()) return null;
      const p = this.p, s = this.stakeForStep(this.step);
      if (s > +p.max_stake + 1e-9) return this.halt(`Next stake $${s.toFixed(2)} would exceed the $${(+p.max_stake).toFixed(2)} cap`);
      // a full loss on the next trade must not push past the session stop-loss
      if (this.pnl - s < -p.session_sl - 1e-9) return this.halt(`Next stake $${s.toFixed(2)} could break the $${(+p.session_sl).toFixed(2)} session stop-loss`);
      this.lastStake = s; return s;
    }
    /** Record a settled contract. profit is signed $ (sell − buy). */
    onResult(profit) {
      profit = +profit || 0; this.trades++; this.pnl = r2(this.pnl + profit);
      if (profit > 0) { this.wins++; this.consecLosses = 0; if (this.p.martingale) this.step = this.p.mg_reset_win ? 0 : Math.max(0, this.step - 1); }
      else { this.losses++; this.consecLosses++; if (this.p.martingale) this.step++; }
      return this.check();
    }
    /** Returns the halt reason if any limit is reached (and records it), else null. */
    check() {
      const p = this.p; const stop = r => { this.halt(r); return this.haltReason; };
      if (this.haltReason) return this.haltReason;
      if (this.pnl <= -p.session_sl + 1e-9) return stop(`Session stop-loss hit (${fmt(this.pnl)})`);
      if (this.pnl >= +p.session_tp - 1e-9) return stop(`Take-profit reached (${fmt(this.pnl)})`);
      if (this.consecLosses >= p.max_consec_losses) return stop(`${this.consecLosses} losses in a row (max ${p.max_consec_losses})`);
      if (p.martingale && this.step > p.mg_max_steps) return stop(`Martingale max steps (${p.mg_max_steps}) used up`);
      return null;
    }
    halt(reason) { if (!this.haltReason) this.haltReason = reason; return null; }
    snapshot() { return { step: this.step, pnl: this.pnl, trades: this.trades, wins: this.wins, losses: this.losses, consecLosses: this.consecLosses, haltReason: this.haltReason, nextStake: this.haltReason ? null : this.stakeForStep(this.step) }; }
  }
  const fmt = x => (x >= 0 ? '+$' : '−$') + Math.abs(x).toFixed(2);

  function statsOf(rows) {
    const done = rows.filter(t => t.status === 'settled');
    const w = done.filter(t => t.profit > 0).length;
    const pnl = r2(done.reduce((s, t) => s + (+t.profit || 0), 0));
    const staked = r2(done.reduce((s, t) => s + (+t.stake || 0), 0));
    return { trades: done.length, open: rows.filter(t => t.status === 'open').length, wins: w, losses: done.length - w, winrate: done.length ? w / done.length : null, pnl, staked };
  }

  /** Proposal request (new Deriv options WebSocket API). date_expiry (epoch) is used when aligned to candles. */
  function buildProposal(p, { stake, direction, currency, date_expiry }) {
    const req = { proposal: 1, amount: roundStake(stake), basis: 'stake', currency: currency || 'USD', underlying_symbol: SYMBOL, contract_type: direction === 'up' ? 'CALL' : 'PUT' };
    if (date_expiry && p.cycle !== 'ticks') req.date_expiry = date_expiry; else Object.assign(req, cycleDuration(p));
    return req;
  }

  const api = { SYMBOL, SYMBOL_NAME, MIN_STAKE, BOT, BOT_TYPES, STRATEGIES, modelParams, TICKS, CYCLES, CYCLE_OPTS, cycleSec, cycleDuration, cycleLabel, graceSec, alignPlan, analysisTFs, gLabel, GRANS,
    roundStake, stakeLadder, validateParams, BotRun, statsOf, buildProposal, r2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ATSEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
