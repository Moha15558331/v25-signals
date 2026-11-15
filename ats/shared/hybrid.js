/* ATS bot ("hybrid"): Differs on the least-occurring digit, digit Over/Under recovery after a loss. Pure logic, no network.
 * Shared by the server (require) and the phone app (window.ATSHybrid).
 *
 * Differs  : DIGITDIFF on 1HZ25V, 1 tick, base stake. Barrier = least-occurring last digit of the last `lookback` ticks
 *            (ties -> the colder digit = the one whose last appearance in the window is earliest, never seen = -1).
 *            Exact port of the HTML analyzer and /workspace/hybrid-backtest/backtest.py least_digits().
 * Recovery : after a Differs loss, 1-tick DIGITOVER 2 (wins on 3–9) or DIGITUNDER 7 (wins on 0–6).
 *            Side (rec_side 'auto'): count the losing digits of each side in the same lookback window,
 *            low = 0+1+2, high = 7+8+9. low < high -> Over 2, high < low -> Under 7; tie -> the side whose losing digits
 *            were rarer in the last 20 ticks; still tied -> Over 2. 'over' / 'under' force one side.
 *            Stakes = base × factor^step, step 1..max (0.35 × 3.1 -> 1.09, 3.36, 10.43). Smart martingale: a stake is cut
 *            to the room left before any stop-loss and to the max stake cap.
 *            Recovery win -> back to Differs at base. All steps lost -> back to Differs at base (chain busted).
 * Limits   : daily +day_tp lock / −day_sl stop (00:00 reset: the bot waits, then carries on),
 *            session SL/TP, max losses in a row, max stake cap (these halt the bot). */
(function (root) {
  'use strict';
  const r2 = x => Math.round((+x + Number.EPSILON) * 100) / 100;
  const floor2 = x => Math.floor((+x + 1e-9) * 100) / 100;
  const MIN_STAKE = 0.35, PIP = 2;
  const DEFAULTS = { stake: 0.35, diff_lookback: 100, diff_gap: 2.5, rec_side: 'auto', mg_factor: 3.1, mg_max_steps: 3, smart_mg: true,
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
  const REC = { over: { contract_type: 'DIGITOVER', barrier: 2, label: 'Over 2', lose: [0, 1, 2] }, under: { contract_type: 'DIGITUNDER', barrier: 7, label: 'Under 7', lose: [7, 8, 9] } };
  const REC_SIDES = [['auto', 'Auto'], ['over', 'Over 2'], ['under', 'Under 7']];
  /** Recovery side from the recent digits (oldest first). mode 'auto' | 'over' | 'under'. Returns {side, low, high, n, how}. */
  function recoverySide(digits, mode) {
    const cnt = (ds, set) => ds.reduce((a, d) => a + (set.includes(d) ? 1 : 0), 0);
    const low = cnt(digits, REC.over.lose), high = cnt(digits, REC.under.lose), n = digits.length;
    if (mode === 'over' || mode === 'under') return { side: mode, low, high, n, how: 'fixed' };
    if (low !== high) return { side: low < high ? 'over' : 'under', low, high, n, how: `0–2 ×${low} vs 7–9 ×${high}` };
    const t = digits.slice(-20), l2 = cnt(t, REC.over.lose), h2 = cnt(t, REC.under.lose);
    if (l2 !== h2) return { side: l2 < h2 ? 'over' : 'under', low, high, n, how: `tie, last 20: 0–2 ×${l2} vs 7–9 ×${h2}` };
    return { side: 'over', low, high, n, how: 'tie' };
  }
  const recReq = side => ({ contract_type: REC[side].contract_type, barrier: String(REC[side].barrier), duration: 1, duration_unit: 't' });
  const dayKey = ep => new Date((ep + 10800) * 1000).toISOString().slice(0, 10); // UTC+3 trading day
  const nextMidnight = ep => { const t = ep + 10800; return (Math.floor(t / 86400) + 1) * 86400 - 10800; };
  const recStake = (p, step) => Math.max(MIN_STAKE, r2(+p.stake * Math.pow(+p.mg_factor, step)));
  const ladder = p => { const out = [{ step: 0, kind: 'differs', stake: r2(p.stake) }]; for (let i = 1; i <= +p.mg_max_steps; i++) out.push({ step: i, kind: 'overunder', stake: recStake(p, i), over_cap: recStake(p, i) > +p.max_stake + 1e-9 }); return out; };

  function validate(p) {
    const errs = []; const num = (k, min, max, label) => { const v = +p[k]; if (!isFinite(v) || v < min || v > max) errs.push(`${label} must be ${min}–${max}`); };
    num('stake', MIN_STAKE, 1000, 'Differs stake'); if (Math.abs(r2(p.stake) - +p.stake) > 1e-9) errs.push('Stake can have at most 2 decimals');
    num('diff_lookback', 10, 1000, 'Digit lookback'); num('diff_gap', 0, 60, 'Gap between Differs trades');
    if (p.rec_side != null && !REC_SIDES.some(o => o[0] === p.rec_side)) errs.push('Pick a recovery side');
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
    /** Roll to a new trading day if needed (resets day P/L and the chain). Returns true on a roll. */
    roll(t) { const d = dayKey(t); if (d === this.day) return false;
      Object.assign(this, { day: d, dayPnl: 0, dayTrades: 0, dayWins: 0, dayState: 'trading', dayReason: null, phase: 'differs', step: 0, chainLoss: 0 }); return true; }
    /** Clear today's P/L and unlock the day (demo Reset today). History is not touched. */
    resetDay(t) { Object.assign(this, { day: dayKey(t || Math.floor(Date.now() / 1000)), dayPnl: 0, dayTrades: 0, dayWins: 0, dayState: 'trading', dayReason: null }); return this; }
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
     *  Returns {kind:'differs'|'overunder', stake, step, capped, full} | {wait:'day', until, reason} | {halt}. */
    next(t, extraRoom) {
      this.roll(t); if (this.check()) return { halt: this.haltReason };
      if (this.dayState !== 'trading' || this.dayCheck()) return { wait: 'day', until: nextMidnight(t), reason: this.dayReason, state: this.dayState };
      const p = this.p, kind = this.phase === 'recovery' ? 'overunder' : 'differs';
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
    /** Record a settled trade. kind = 'differs' | anything else = a recovery trade. Returns an event: {event, ...} for alerts. */
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
  /** Effective stakes of a losing chain that starts at today's P/L `dayPnl` (default a fresh day): every cap applied in order.
   *  Returns ladder rows with eff (0 = not reached: the day stop ends the chain) and cut ('day stop' | 'max stake' | null). */
  function effLadder(p, dayPnl, room) {
    const r = new HybridRun(p, 1794800000); r.dayPnl = +dayPnl || 0; let ended = false;
    return ladder(r.p).map(x => { if (ended) return Object.assign({}, x, { eff: 0, cut: 'day stop' });
      const n = r.next(1794800000, room); if (!n.stake) { ended = true; return Object.assign({}, x, { eff: 0, cut: n.halt ? 'limit' : 'day stop' }); }
      const dayRoom = Math.floor((+r.p.day_sl + r.dayPnl + 1e-9) * 100) / 100; const cut = n.capped ? (n.stake >= +r.p.max_stake - 1e-9 ? 'max stake' : Math.abs(n.stake - dayRoom) < 0.005 ? 'day stop' : 'session stop') : null; r.onResult(x.step ? 'overunder' : 'differs', -n.stake);
      return Object.assign({}, x, { eff: n.stake, cut }); });
  }

  /** Stats by condition from history rows (strategy 'hybrid'). */
  function stats(rows) {
    const done = rows.filter(h => h.status === 'settled' && h.strategy === 'hybrid');
    const blk = rs => { const w = rs.filter(h => h.profit > 0).length; return { n: rs.length, wins: w, losses: rs.length - w, winrate: rs.length ? +(w / rs.length).toFixed(4) : null, pnl: r2(rs.reduce((a, h) => a + (+h.profit || 0), 0)), staked: r2(rs.reduce((a, h) => a + (+h.stake || 0), 0)) }; };
    const diff = done.filter(h => h.phase === 'differs'), rec = done.filter(h => h.phase === 'recovery');
    const steps = {}; for (const h of rec) (steps[h.step] = steps[h.step] || []).push(h);
    const byStep = Object.keys(steps).sort().map(s => Object.assign({ step: +s }, blk(steps[s])));
    const sides = {}; for (const h of rec) { const k = h.contract_type === 'DIGITOVER' ? 'over' : h.contract_type === 'DIGITUNDER' ? 'under' : 'risefall'; (sides[k] = sides[k] || []).push(h); }
    const bySide = Object.keys(sides).map(k => Object.assign({ side: k }, blk(sides[k])));
    const chains = {}; for (const h of rec) if (h.chain_id) (chains[h.chain_id] = chains[h.chain_id] || []).push(h);
    let recovered = 0, busted = 0, cut = 0; for (const c of Object.values(chains)) { const last = c[c.length - 1]; if (last.profit > 0) recovered++; else if (last.chain_end === 'bust') busted++; else if (last.chain_end) cut++; }
    const hours = {}; for (const h of done) { const hr = new Date((h.t + 10800) * 1000).getUTCHours(); (hours[hr] = hours[hr] || []).push(h); }
    const byHour = Object.keys(hours).map(Number).sort((a, b) => a - b).map(hr => Object.assign({ hour: hr }, blk(hours[hr])));
    const days = {}; for (const h of done) { const d = dayKey(h.t); (days[d] = days[d] || []).push(h); }
    const byDay = Object.keys(days).sort().reverse().slice(0, 30).map(d => Object.assign({ day: d }, blk(days[d])));
    const digits = Array(10).fill(0).map((_, d) => blk(diff.filter(h => +h.barrier === d)));
    return { all: blk(done), differs: blk(diff), recovery: blk(rec), by_step: byStep,
      chains: { started: diff.filter(h => !(h.profit > 0)).length, recovered, busted, cut_short: cut, open: Math.max(0, Object.keys(chains).length - recovered - busted - cut) },
      by_side: bySide, by_hour: byHour, by_day: byDay, by_digit: digits,
      breakeven: { differs: diff.length ? +(diff.reduce((a, h) => a + (h.buy_price || h.stake) / (h.payout || 1), 0) / diff.length).toFixed(4) : null,
        recovery: rec.length ? +(rec.reduce((a, h) => a + (h.buy_price || h.stake) / (h.payout || 1), 0) / rec.length).toFixed(4) : null } };
  }

  const api = { DEFAULTS, MIN_STAKE, PIP, REC, REC_SIDES, recoverySide, recReq, effLadder, lastDigit, leastDigit, dayKey, nextMidnight, recStake, ladder, validate, HybridRun, stats, r2, floor2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ATSHybrid = api;
})(typeof window !== 'undefined' ? window : globalThis);
