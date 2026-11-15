/* Rise/Fall 1H bot: one Rise/Fall contract per hour candle on Volatility 25 (1s), the V25 signal idea. Pure logic, no network.
 * Shared by the server (require) and the phone app (window.ATSRF1H).
 *
 * Signal  : at each hour boundary (within the first minute), core.js predict() on 1h candles (main) with 4h and 1d above,
 *           15m below and 1m for the volatility regime. buy -> Rise (CALL), sell -> Fall (PUT), expiring at the next hour.
 *           Neutral: 'skip' (default, no trade that hour) or 'lean' (follow the sign of the score).
 * Stakes  : base × factor^step, step 0..mg_max_steps (0.35 × 2.1 -> 0.35, 0.74, 1.54, 3.24). Win -> base. All steps lost -> base.
 *           Smart martingale cuts a stake to the room left before any stop-loss and to the max stake cap.
 * Limits  : daily +day_tp lock / −day_sl stop (00:00 reset, the bot waits and carries on). Combined ATS session limits apply on the server. */
(function (root) {
  'use strict';
  const r2 = x => Math.round((+x + Number.EPSILON) * 100) / 100;
  const floor2 = x => Math.floor((+x + 1e-9) * 100) / 100;
  const MIN_STAKE = 0.35, CYCLE = 3600;
  const DEFAULTS = { stake: 0.35, mg_factor: 2.1, mg_max_steps: 3, smart_mg: true, neutral: 'skip', day_tp: 1, day_sl: 2, max_stake: 3.5 };
  const NEUTRAL = [['skip', 'Skip the hour'], ['lean', 'Follow the lean']];
  const dayKey = ep => new Date((ep + 10800) * 1000).toISOString().slice(0, 10); // UTC+3 trading day
  const nextMidnight = ep => { const t = ep + 10800; return (Math.floor(t / 86400) + 1) * 86400 - 10800; };
  const stakeAt = (p, step) => Math.max(MIN_STAKE, r2(+p.stake * Math.pow(+p.mg_factor, step)));
  const ladder = p => { const out = []; for (let i = 0; i <= +p.mg_max_steps; i++) out.push({ step: i, stake: stakeAt(p, i), over_cap: stakeAt(p, i) > +p.max_stake + 1e-9 }); return out; };
  /** Hour plan: trade now if within the first `grace` seconds of the hour and >= 15 min left, else wait for the next hour. */
  function hourPlan(t, grace = 60) { const start = Math.floor(t / CYCLE) * CYCLE, end = start + CYCLE;
    return t - start <= grace ? { now: true, start, date_expiry: end } : { now: false, next: end, date_expiry: end + CYCLE }; }
  /** Direction from a core.js prediction. Returns {dir:'up'|'down'|null, how}. */
  function direction(pred, neutral) {
    if (pred && (pred.direction === 'buy' || pred.direction === 'sell')) return { dir: pred.direction === 'buy' ? 'up' : 'down', how: `signal ${pred.confidence}%` };
    if (neutral === 'lean' && pred && pred.score) return { dir: pred.score > 0 ? 'up' : 'down', how: 'lean' };
    return { dir: null, how: 'no signal' };
  }
  function validate(p) {
    const errs = []; const num = (k, min, max, label) => { const v = +p[k]; if (!isFinite(v) || v < min || v > max) errs.push(`${label} must be ${min}–${max}`); };
    num('stake', MIN_STAKE, 1000, 'Stake'); if (Math.abs(r2(p.stake) - +p.stake) > 1e-9) errs.push('Stake can have at most 2 decimals');
    num('mg_factor', 1.01, 20, 'Martingale factor'); num('mg_max_steps', 0, 10, 'Martingale steps');
    num('day_tp', 0.01, 1000, 'Daily profit lock'); num('day_sl', 0.01, 1000, 'Daily stop'); num('max_stake', MIN_STAKE, 1000, 'Max stake');
    if (+p.max_stake < +p.stake) errs.push('Max stake must be at least the stake');
    if (+p.stake > +p.day_sl) errs.push('Stake is larger than the daily stop');
    if (!NEUTRAL.some(o => o[0] === p.neutral)) errs.push('Pick what to do without a signal');
    return errs;
  }
  class RFRun {
    constructor(p, t) { this.p = Object.assign({}, DEFAULTS, p); this.step = 0; this.chain = 0; this.pnl = 0; this.trades = 0; this.wins = 0; this.losses = 0; this.haltReason = null;
      this.day = dayKey(t || Math.floor(Date.now() / 1000)); this.dayPnl = 0; this.dayTrades = 0; this.dayWins = 0; this.dayState = 'trading'; this.dayReason = null; }
    static from(o, p) { const r = new RFRun(p); Object.assign(r, o || {}); r.p = Object.assign({}, DEFAULTS, p); return r; }
    roll(t) { const d = dayKey(t); if (d === this.day) return false;
      Object.assign(this, { day: d, dayPnl: 0, dayTrades: 0, dayWins: 0, dayState: 'trading', dayReason: null, step: 0 }); return true; }
    resetDay(t) { Object.assign(this, { day: dayKey(t || Math.floor(Date.now() / 1000)), dayPnl: 0, dayTrades: 0, dayWins: 0, dayState: 'trading', dayReason: null }); return this; }
    dayCheck() { const p = this.p;
      if (this.dayPnl >= +p.day_tp - 1e-9) { this.dayState = 'locked'; this.dayReason = `Daily +$${(+p.day_tp).toFixed(2)} lock reached`; }
      else if (this.dayPnl <= -p.day_sl + 1e-9) { this.dayState = 'stopped'; this.dayReason = `Daily −$${(+p.day_sl).toFixed(2)} stop reached`; }
      return this.dayState !== 'trading'; }
    halt(r) { if (!this.haltReason) this.haltReason = r; return { halt: this.haltReason }; }
    /** Next stake. extraRoom = $ that may still be lost before an outside limit (combined ATS session stop-loss).
     *  Returns {stake, step, capped, full} | {wait:'day', until, reason, state} | {halt}. */
    next(t, extraRoom) {
      this.roll(t); if (this.haltReason) return { halt: this.haltReason };
      if (this.dayState !== 'trading' || this.dayCheck()) return { wait: 'day', until: nextMidnight(t), reason: this.dayReason, state: this.dayState };
      const p = this.p, full = stakeAt(p, this.step), dayRoom = r2(+p.day_sl + this.dayPnl), outRoom = extraRoom == null ? Infinity : r2(extraRoom);
      const room = Math.min(dayRoom, outRoom, +p.max_stake); let stake = full, capped = false;
      if (stake > room + 1e-9) {
        if (!p.smart_mg) { if (dayRoom < stake - 1e-9 && dayRoom <= outRoom) return this.dayStopEarly(t, stake); return this.halt(`Next stake $${stake.toFixed(2)} could break a limit`); }
        stake = floor2(room); capped = true;
        if (stake < MIN_STAKE - 1e-9) { if (dayRoom <= outRoom) return this.dayStopEarly(t, MIN_STAKE); return this.halt(`Only $${room.toFixed(2)} left before the session stop-loss`); }
      }
      return { stake, step: this.step, capped, full };
    }
    dayStopEarly(t, s) { this.dayState = 'stopped'; this.dayReason = `Daily stop: a $${s.toFixed(2)} trade could break the −$${(+this.p.day_sl).toFixed(2)} stop`;
      return { wait: 'day', until: nextMidnight(t), reason: this.dayReason, state: 'stopped' }; }
    onResult(profit) {
      profit = r2(+profit || 0); const win = profit > 0, p = this.p, step = this.step; let event;
      this.trades++; this.pnl = r2(this.pnl + profit); this.dayTrades++; this.dayPnl = r2(this.dayPnl + profit);
      if (win) { this.wins++; this.dayWins++; event = step > 0 ? 'recovered' : 'win'; this.step = 0; }
      else { this.losses++; if (step === 0) this.chain++; if (step >= +p.mg_max_steps) { event = 'chain_bust'; this.step = 0; } else { event = 'loss'; this.step = step + 1; } }
      const was = this.dayState === 'trading'; this.dayCheck(); const dayHit = was && this.dayState !== 'trading' ? this.dayState : null;
      if (dayHit) { if (this.step > 0) event = 'chain_cut'; this.step = 0; }
      return { event, win, profit, step: this.step, day: this.dayState, dayHit, halt: this.haltReason };
    }
    snapshot() { const o = {}; for (const k of ['step', 'chain', 'pnl', 'trades', 'wins', 'losses', 'haltReason', 'day', 'dayPnl', 'dayTrades', 'dayWins', 'dayState', 'dayReason']) o[k] = this[k]; return o; }
  }
  /** Effective stakes of a losing chain from today's P/L `dayPnl` with every cap applied (eff 0 = the day stop ends the chain first). */
  function effLadder(p, dayPnl, room) {
    const r = new RFRun(p, 1794800000); r.dayPnl = +dayPnl || 0; let ended = false;
    return ladder(r.p).map(x => { if (ended) return Object.assign({}, x, { eff: 0, cut: 'day stop' });
      const n = r.next(1794800000, room); if (!n.stake) { ended = true; return Object.assign({}, x, { eff: 0, cut: n.halt ? 'limit' : 'day stop' }); }
      const dayRoom = Math.floor((+r.p.day_sl + r.dayPnl + 1e-9) * 100) / 100; const cut = n.capped ? (n.stake >= +r.p.max_stake - 1e-9 ? 'max stake' : Math.abs(n.stake - dayRoom) < 0.005 ? 'day stop' : 'session stop') : null; r.onResult(-n.stake);
      return Object.assign({}, x, { eff: n.stake, cut }); });
  }
  /** Stats for rows of strategy 'rf1h'. */
  function stats(rows) {
    const done = rows.filter(h => h.status === 'settled' && h.strategy === 'rf1h');
    const blk = rs => { const w = rs.filter(h => h.profit > 0).length; return { n: rs.length, wins: w, losses: rs.length - w, winrate: rs.length ? +(w / rs.length).toFixed(4) : null, pnl: r2(rs.reduce((a, h) => a + (+h.profit || 0), 0)), staked: r2(rs.reduce((a, h) => a + (+h.stake || 0), 0)) }; };
    const steps = {}; for (const h of done) (steps[h.step | 0] = steps[h.step | 0] || []).push(h);
    const hours = {}; for (const h of done) { const hr = new Date((h.t + 10800) * 1000).getUTCHours(); (hours[hr] = hours[hr] || []).push(h); }
    const days = {}; for (const h of done) { const d = dayKey(h.t); (days[d] = days[d] || []).push(h); }
    const withPay = done.filter(h => +h.payout > 0);
    return { all: blk(done), rise: blk(done.filter(h => h.contract_type === 'CALL')), fall: blk(done.filter(h => h.contract_type === 'PUT')),
      by_step: Object.keys(steps).map(Number).sort((a, b) => a - b).map(s => Object.assign({ step: s }, blk(steps[s]))),
      chains: { recovered: done.filter(h => h.chain_end === 'recovered').length, busted: done.filter(h => h.chain_end === 'bust').length, cut_short: done.filter(h => h.chain_end === 'cut').length },
      by_hour: Object.keys(hours).map(Number).sort((a, b) => a - b).map(hr => Object.assign({ hour: hr }, blk(hours[hr]))),
      by_day: Object.keys(days).sort().reverse().slice(0, 30).map(d => Object.assign({ day: d }, blk(days[d]))),
      breakeven: withPay.length ? +(withPay.reduce((a, h) => a + (h.buy_price || h.stake) / h.payout, 0) / withPay.length).toFixed(4) : null };
  }
  const api = { DEFAULTS, NEUTRAL, MIN_STAKE, CYCLE, dayKey, nextMidnight, stakeAt, ladder, effLadder, hourPlan, direction, validate, RFRun, stats, r2, floor2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ATSRF1H = api;
})(typeof window !== 'undefined' ? window : globalThis);
