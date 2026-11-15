/* ATS bot ("hybrid"): Differs on the least-occurring digit, Rise/Fall recovery after a loss. Pure logic, no network.
 * Shared by the server (require) and the phone app (window.ATSHybrid).
 *
 * Differs  : DIGITDIFF on 1HZ25V, 1 tick, base stake. Barrier = least-occurring last digit of the last `lookback` ticks
 *            (ties -> the colder digit = the one whose last appearance in the window is earliest, never seen = -1).
 *            Exact port of the HTML analyzer and /workspace/hybrid-backtest/backtest.py least_digits().
 * Recovery : after a Differs loss, Rise/Fall (CALL/PUT) for `rec_secs` seconds. Stakes = base × factor^step, step 1..max
 *            (0.35 × 2.1 -> 0.74, 1.54, 3.24). Smart martingale: a stake is cut to the room left before any stop-loss.
 *            Recovery win -> back to Differs at base. All steps lost -> back to Differs at base (chain busted).
 * Limits   : daily +day_tp lock / −day_sl stop (Bahrain day, 00:00 reset: the bot waits, then carries on),
 *            session SL/TP, max losses in a row, max stake cap (these halt the bot). */
(function (root) {
  'use strict';
  const r2 = x => Math.round((+x + Number.EPSILON) * 100) / 100;
  const floor2 = x => Math.floor((+x + 1e-9) * 100) / 100;
  const MIN_STAKE = 0.35, PIP = 2;
  const DEFAULTS = { stake: 0.35, diff_lookback: 100, diff_gap: 2.5, rec_secs: 15, mg_factor: 2.1, mg_max_steps: 3, smart_mg: true,
    day_tp: 1, day_sl: 2, session_sl: 6, session_tp: 3, max_consec_losses: 4, max_stake: 3.5 };

  /** Last digit of a quote exactly as the HTML: toFixed(pip) then the final character. */
  const lastDigit = (price, pip = PIP) => { const s = (+price).toFixed(pip); return +s[s.length - 1]; };
  /** Least-occurring digit of `digits` (oldest first). Tie -> lower lastAt (seen earliest / never). Returns {digit, freq, lastAt}. */
  function leastDigit(digits) {
    const freq = Array(10).fill(0), lastAt = Array(10).fill(-1);
    digits.forEach((d, i) => { freq[d]++; lastAt[d] = i; });
    let least = 0;
    for (let d = 1; d <= 9; d++) if (freq[d] < freq[least] || (freq[d] === freq[least] && lastAt[d] < lastAt[least])) least = d;
    return { digit: least, freq, lastAt, n: digits.length };
  }
  const dayKey = ep => new Date((ep + 10800) * 1000).toISOString().slice(0, 10); // Bahrain (UTC+3)
  const nextMidnight = ep => { const t = ep + 10800; return (Math.floor(t / 86400) + 1) * 86400 - 10800; };
  const recStake = (p, step) => Math.max(MIN_STAKE, r2(+p.stake * Math.pow(+p.mg_factor, step)));
  const ladder = p => { const out = [{ step: 0, kind: 'differs', stake: r2(p.stake) }]; for (let i = 1; i <= +p.mg_max_steps; i++) out.push({ step: i, kind: 'risefall', stake: recStake(p, i) }); return out; };

  function validate(p) {
    const errs = []; const num = (k, min, max, label) => { const v = +p[k]; if (!isFinite(v) || v < min || v > max) errs.push(`${label} must be ${min}–${max}`); };
    num('stake', MIN_STAKE, 1000, 'Differs stake'); if (Math.abs(r2(p.stake) - +p.stake) > 1e-9) errs.push('Stake can have at most 2 decimals');
    num('diff_lookback', 10, 1000, 'Digit lookback'); num('diff_gap', 0, 60, 'Gap between Differs trades');
    num('rec_secs', 15, 3600, 'Recovery duration (seconds)'); if (!Number.isInteger(+p.rec_secs)) errs.push('Recovery duration must be whole seconds');
    num('mg_factor', 1.01, 20, 'Martingale factor'); num('mg_max_steps', 1, 10, 'Recovery steps');
    num('day_tp', 0.01, 1000, 'Daily profit lock'); num('day_sl', 0.01, 1000, 'Daily stop');
    num('session_sl', 0.01, 100000, 'Session stop-loss'); num('session_tp', 0.01, 100000, 'Session take-profit');
    num('max_consec_losses', 1, 50, 'Max losses in a row'); num('max_stake', MIN_STAKE, 1000, 'Max stake cap');
    if (+p.max_stake < +p.stake) errs.push('Max stake cap must be at least the stake');
    if (+p.stake > +p.day_sl) errs.push('Stake is larger than the daily stop');
    return errs;
  }

  class HybridRun {
    constructor(p, t) { this.p = Object.assign({}, DEFAULTS, p); this.phase = 'differs'; this.step = 0; this.chain = 0; this.chainLoss = 0;
      this.pnl = 0; this.trades = 0; this.wins = 0; this.losses = 0; this.consecLosses = 0; this.haltReason = null;
      this.day = dayKey(t || Math.floor(Date.now() / 1000)); this.dayPnl = 0; this.dayTrades = 0; this.dayWins = 0; this.dayState = 'trading'; this.dayReason = null; }
    static from(o, p) { const r = new HybridRun(p); Object.assign(r, o || {}); r.p = Object.assign({}, DEFAULTS, p); return r; }
    /** Roll to a new Bahrain day if needed (resets day P/L and the chain). Returns true on a roll. */
    roll(t) { const d = dayKey(t); if (d === this.day) return false;
      Object.assign(this, { day: d, dayPnl: 0, dayTrades: 0, dayWins: 0, dayState: 'trading', dayReason: null, phase: 'differs', step: 0, chainLoss: 0 }); return true; }
    dayCheck() { const p = this.p;
      if (this.dayPnl >= +p.day_tp - 1e-9) { this.dayState = 'locked'; this.dayReason = `Daily +$${(+p.day_tp).toFixed(2)} lock reached`; }
      else if (this.dayPnl <= -p.day_sl + 1e-9) { this.dayState = 'stopped'; this.dayReason = `Daily −$${(+p.day_sl).toFixed(2)} stop reached`; }
      return this.dayState !== 'trading'; }
    halt(r) { if (!this.haltReason) this.haltReason = r; return { halt: this.haltReason }; }
    check() { const p = this.p;
      if (this.haltReason) return this.haltReason;
      if (this.pnl <= -p.session_sl + 1e-9) this.haltReason = `Session stop-loss hit (${fmt(this.pnl)})`;
      else if (this.pnl >= +p.session_tp - 1e-9) this.haltReason = `Session take-profit reached (${fmt(this.pnl)})`;
      else if (this.consecLosses >= p.max_consec_losses) this.haltReason = `${this.consecLosses} losses in a row (max ${p.max_consec_losses})`;
      return this.haltReason; }
    /** What to trade next. extraRoom = tightest outside room ($ that may still be lost: ATS global limit, real lifetime cap).
     *  Returns {kind:'differs'|'risefall', stake, step, capped, full} | {wait:'day', until, reason} | {halt}. */
    next(t, extraRoom) {
      this.roll(t); if (this.check()) return { halt: this.haltReason };
      if (this.dayState !== 'trading' || this.dayCheck()) return { wait: 'day', until: nextMidnight(t), reason: this.dayReason, state: this.dayState };
      const p = this.p, kind = this.phase === 'recovery' ? 'risefall' : 'differs';
      const full = kind === 'differs' ? r2(p.stake) : recStake(p, this.step);
      const dayRoom = r2(+p.day_sl + this.dayPnl), sesRoom = r2(+p.session_sl + this.pnl);
      const outRoom = extraRoom == null ? Infinity : r2(extraRoom);
      const room = Math.min(dayRoom, sesRoom, outRoom, +p.max_stake);
      let stake = full, capped = false;
      if (stake > room + 1e-9) {
        if (!p.smart_mg && stake > +p.max_stake + 1e-9) return this.halt(`Next stake $${stake.toFixed(2)} would exceed the $${(+p.max_stake).toFixed(2)} cap`);
        if (!p.smart_mg) { if (dayRoom <= sesRoom && dayRoom <= outRoom) return this.dayStopEarly(t, stake); return this.halt(`Next stake $${stake.toFixed(2)} could break a stop-loss`); }
        stake = floor2(room); capped = true;
        if (stake < MIN_STAKE - 1e-9) { if (dayRoom <= sesRoom && dayRoom <= outRoom) return this.dayStopEarly(t, MIN_STAKE); return this.halt(`Only $${room.toFixed(2)} left before a stop-loss — below the $0.35 minimum`); }
      }
      return { kind, stake, step: kind === 'differs' ? 0 : this.step, capped, full };
    }
    dayStopEarly(t, s) { this.dayState = 'stopped'; this.dayReason = `Daily stop: a $${s.toFixed(2)} trade could break the −$${(+this.p.day_sl).toFixed(2)} stop`;
      return { wait: 'day', until: nextMidnight(t), reason: this.dayReason, state: 'stopped' }; }
    /** Record a settled trade. kind = 'differs' | 'risefall'. Returns an event: {event, ...} for alerts. */
    onResult(kind, profit) {
      profit = r2(+profit || 0); const win = profit > 0; const p = this.p;
      this.trades++; this.pnl = r2(this.pnl + profit); this.dayTrades++; this.dayPnl = r2(this.dayPnl + profit);
      if (win) { this.wins++; this.dayWins++; this.consecLosses = 0; } else { this.losses++; this.consecLosses++; }
      let event;
      if (kind === 'differs') {
        if (win) event = 'differs_win';
        else { this.phase = 'recovery'; this.step = 1; this.chain++; this.chainLoss = -profit; event = 'recovery_start'; }
      } else {
        if (win) { event = 'recovered'; this.phase = 'differs'; this.step = 0; this.chainLoss = 0; }
        else if (this.step >= +p.mg_max_steps) { event = 'chain_bust'; this.phase = 'differs'; this.step = 0; this.chainLoss = 0; }
        else { this.chainLoss = r2(this.chainLoss - profit); this.step++; event = 'recovery_next'; }
      }
      const wasTrading = this.dayState === 'trading', midChain = this.phase === 'recovery'; this.dayCheck();
      const dayHit = wasTrading && this.dayState !== 'trading' ? this.dayState : null;
      if (dayHit) { if (midChain) event = 'chain_cut'; this.phase = 'differs'; this.step = 0; this.chainLoss = 0; }
      this.check();
      return { event, win, profit, phase: this.phase, step: this.step, day: this.dayState, dayHit, halt: this.haltReason };
    }
    snapshot() { const o = {}; for (const k of ['phase', 'step', 'chain', 'chainLoss', 'pnl', 'trades', 'wins', 'losses', 'consecLosses', 'haltReason', 'day', 'dayPnl', 'dayTrades', 'dayWins', 'dayState', 'dayReason']) o[k] = this[k]; return o; }
  }
  const fmt = x => (x >= 0 ? '+$' : '−$') + Math.abs(x).toFixed(2);

  /** Stats by condition from history rows (strategy 'hybrid'). */
  function stats(rows) {
    const done = rows.filter(h => h.status === 'settled' && h.strategy === 'hybrid');
    const blk = rs => { const w = rs.filter(h => h.profit > 0).length; return { n: rs.length, wins: w, losses: rs.length - w, winrate: rs.length ? +(w / rs.length).toFixed(4) : null, pnl: r2(rs.reduce((a, h) => a + (+h.profit || 0), 0)), staked: r2(rs.reduce((a, h) => a + (+h.stake || 0), 0)) }; };
    const diff = done.filter(h => h.phase === 'differs'), rec = done.filter(h => h.phase === 'recovery');
    const steps = {}; for (const h of rec) (steps[h.step] = steps[h.step] || []).push(h);
    const byStep = Object.keys(steps).sort().map(s => Object.assign({ step: +s }, blk(steps[s])));
    const chains = {}; for (const h of rec) if (h.chain_id) (chains[h.chain_id] = chains[h.chain_id] || []).push(h);
    let recovered = 0, busted = 0, cut = 0; for (const c of Object.values(chains)) { const last = c[c.length - 1]; if (last.profit > 0) recovered++; else if (last.chain_end === 'bust') busted++; else if (last.chain_end) cut++; }
    const hours = {}; for (const h of done) { const hr = new Date((h.t + 10800) * 1000).getUTCHours(); (hours[hr] = hours[hr] || []).push(h); }
    const byHour = Object.keys(hours).map(Number).sort((a, b) => a - b).map(hr => Object.assign({ hour: hr }, blk(hours[hr])));
    const days = {}; for (const h of done) { const d = dayKey(h.t); (days[d] = days[d] || []).push(h); }
    const byDay = Object.keys(days).sort().reverse().slice(0, 30).map(d => Object.assign({ day: d }, blk(days[d])));
    const digits = Array(10).fill(0).map((_, d) => blk(diff.filter(h => +h.barrier === d)));
    return { all: blk(done), differs: blk(diff), recovery: blk(rec), by_step: byStep,
      chains: { started: diff.filter(h => !(h.profit > 0)).length, recovered, busted, cut_short: cut, open: Math.max(0, Object.keys(chains).length - recovered - busted - cut) },
      by_hour: byHour, by_day: byDay, by_digit: digits,
      breakeven: { differs: diff.length ? +(diff.reduce((a, h) => a + (h.buy_price || h.stake) / (h.payout || 1), 0) / diff.length).toFixed(4) : null,
        recovery: rec.length ? +(rec.reduce((a, h) => a + (h.buy_price || h.stake) / (h.payout || 1), 0) / rec.length).toFixed(4) : null } };
  }

  const api = { DEFAULTS, MIN_STAKE, PIP, lastDigit, leastDigit, dayKey, nextMidnight, recStake, ladder, validate, HybridRun, stats, r2, floor2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ATSHybrid = api;
})(typeof window !== 'undefined' ? window : globalThis);
