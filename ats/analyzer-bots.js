/* Deriv Analyzer · barrier & path bots (Higher/Lower, Touch/No Touch, Ends In/Out,
 * Stays In/Goes Out, Asian, Reset Call/Put). Same flow as the Rise/Fall bot:
 * signal → proposal → buy → settle → martingale → TP / SL / steps.
 * The core (no DOM) is shared with the node tests and the demo test harness. */
(function (root) {
  'use strict';

  /* ---------------- core ---------------- */
  const BOTS = {
    hl: { name: 'Higher / Lower', icon: 'H/L', sig: 'dir', sides: [['higher', 'Higher'], ['lower', 'Lower']],
      ct: { higher: 'HIGHER', lower: 'LOWER' }, barrier: 1, k: { higher: 0.6, lower: 0.6 }, dur: [5, 't'], units: ['t', 's', 'm'] },
    tn: { name: 'Touch / No Touch', icon: 'T/N', sig: 'range', sides: [['touch', 'Touch'], ['notouch', 'No Touch']],
      ct: { touch: 'ONETOUCH', notouch: 'NOTOUCH' }, barrier: 1, k: { touch: 0.5, notouch: 0.8 }, dur: [5, 't'], units: ['t', 'm'], out: 'touch' },
    ei: { name: 'Ends In / Out', icon: 'E/I', sig: 'range', sides: [['in', 'Ends In'], ['out', 'Ends Out']],
      ct: { in: 'EXPIRYRANGE', out: 'EXPIRYMISS' }, barrier: 2, k: { in: 0.7, out: 0.7 }, dur: [2, 'm'], units: ['m', 'h'], out: 'out' },
    sg: { name: 'Stays In / Goes Out', icon: 'S/G', sig: 'range', sides: [['in', 'Stays In'], ['out', 'Goes Out']],
      ct: { in: 'RANGE', out: 'UPORDOWN' }, barrier: 2, k: { in: 1.3, out: 1.0 }, dur: [2, 'm'], units: ['m', 'h'], out: 'out' },
    as: { name: 'Asian', icon: 'AS', sig: 'dir', sides: [['up', 'Asian Up'], ['down', 'Asian Down']],
      ct: { up: 'ASIANU', down: 'ASIAND' }, barrier: 0, dur: [5, 't'], units: ['t'] },
    ru: { name: 'Reset Call / Put', icon: 'R/U', sig: 'dir', sides: [['call', 'Reset Call'], ['put', 'Reset Put']],
      ct: { call: 'RESETCALL', put: 'RESETPUT' }, barrier: 0, dur: [5, 't'], units: ['t', 's'] }
  };
  const MIN_STAKE = 0.35;
  const r2 = x => Math.round(x * 100) / 100;
  const ceil2 = x => Math.ceil(x * 100 - 1e-6) / 100;

  /** Tick metrics for one market: rise/fall % (same counting as the Home scanner),
   *  efficiency ratio (0 = choppy/ranging, 1 = straight trend), tick σ and tick interval. */
  function analyzeTicks(prices, times) {
    const n = prices.length; if (n < 3) return null;
    let rise = 0, fall = 0, eq = 0, path = 0, s = 0, s2 = 0;
    for (let i = 1; i < n; i++) { const d = prices[i] - prices[i - 1];
      if (d > 0) rise++; else if (d < 0) fall++; else eq++; path += Math.abs(d); s += d; s2 += d * d; }
    const m = n - 1, mean = s / m, sd = Math.sqrt(Math.max(0, s2 / m - mean * mean));
    const net = prices[n - 1] - prices[0];
    const dt = times && times.length === n && times[n - 1] > times[0] ? (times[n - 1] - times[0]) / (n - 1) : 1;
    return { n, risePct: rise / m * 100, fallPct: fall / m * 100, er: path > 0 ? Math.abs(net) / path : 0, dir: net >= 0 ? 1 : -1, sd, dt, last: prices[n - 1] };
  }

  function parseDur(s) { const m = /^(\d+)([tsmhd])$/.exec(String(s || '')); if (!m) return null;
    const v = +m[1], u = m[2]; return { v, u, sec: u === 't' ? null : v * { s: 1, m: 60, h: 3600, d: 86400 }[u] }; }
  /** Does contracts_for list this contract type for this duration? */
  function supports(avail, ct, dur, unit) {
    if (!Array.isArray(avail)) return false;
    return avail.some(a => { if (a.contract_type !== ct) return false;
      const lo = parseDur(a.min_contract_duration), hi = parseDur(a.max_contract_duration); if (!lo || !hi) return false;
      if (unit === 't') return a.expiry_type === 'tick' && lo.u === 't' && dur >= lo.v && dur <= hi.v;
      if (a.expiry_type !== 'intraday') return false;
      const sec = dur * { s: 1, m: 60, h: 3600 }[unit]; return lo.sec != null && hi.sec != null && sec >= lo.sec && sec <= hi.sec; });
  }

  const sideOk = (bot, side) => BOTS[bot].sides.some(s => s[0] === side);
  /** HTML-style signal: pick the market whose stat is most extreme for the wanted side.
   *  dir bots:   side A → Most Rise market, side B → Most Fall; Both → the bigger of the two.
   *  range bots: "in" sides (Ends In, Stays In, No Touch) → Most Ranging market (lowest trend %);
   *              "out" sides (Ends Out, Goes Out, Touch) → Most Trending market (highest trend %);
   *              Both → compare ranging score (100 − lowest trend %) with highest trend %. */
  function topSignals(bot, scans) {
    const B = BOTS[bot], A = B.sides[0][0], Bs = B.sides[1][0];
    const best = (list, f) => list.length ? list.reduce((a, b) => (f(b) > f(a) ? b : a)) : null;
    const can = (x, k) => x && x.m && (!x.ok || x.ok[k] !== false);
    let la, lb;
    if (B.sig === 'dir') { la = scans.filter(x => can(x, A)); lb = scans.filter(x => can(x, Bs)); }
    else { const inS = B.out === A ? Bs : A; la = scans.filter(x => can(x, inS)); lb = scans.filter(x => can(x, B.out)); }
    const a = B.sig === 'dir' ? best(la, x => x.m.risePct) : best(la, x => -x.m.er);
    const b = B.sig === 'dir' ? best(lb, x => x.m.fallPct) : best(lb, x => x.m.er);
    return a && b ? { a, b } : null;
  }
  function pickSignal(bot, side, scans) {
    const B = BOTS[bot], [A, Bs] = [B.sides[0][0], B.sides[1][0]];
    const t = topSignals(bot, scans); if (!t) return null;
    if (B.sig === 'dir') {
      const pa = t.a.m.risePct, pb = t.b.m.fallPct;
      let s = side; if (side === 'both') { if (pa === pb) return null; s = pa > pb ? A : Bs; }
      const x = s === A ? t.a : t.b;
      return { side: s, sym: x.sym, name: x.name, pct: s === A ? pa : pb, scan: x };
    }
    const outSide = B.out, inSide = outSide === A ? Bs : A;
    const inScore = (1 - t.a.m.er) * 100, outScore = t.b.m.er * 100;
    let s = side; if (side === 'both') s = inScore >= outScore ? inSide : outSide;
    const x = s === inSide ? t.a : t.b;
    // Touch goes with the move; No Touch sits on the opposite side of it.
    return { side: s, sym: x.sym, name: x.name, pct: s === inSide ? inScore : outScore, scan: x, dir: x.m.dir };
  }

  /** Default target payout % (profit ÷ stake) per side for Auto barrier. */
  const TARGET = { hl: { higher: 25, lower: 25 }, tn: { touch: 100, notouch: 40 }, ei: { in: 80, out: 90 }, sg: { in: 40, out: 70 } };
  /** true when a farther barrier pays less (Higher/Lower, No Touch, Ends In, Stays In). */
  const fartherPaysLess = (bot, side) => bot === 'hl' || side === 'notouch' || side === 'in';
  /** Signed barrier strings for an offset in points. Higher → −, Lower → +, Touch with the move,
   *  No Touch against it, range bots ±. */
  function barrierStr(bot, side, off, pip, dir) {
    const B = BOTS[bot]; if (!B.barrier) return {};
    const dp = pip == null ? 2 : pip, min = Math.pow(10, -dp); off = Math.max(+off || 0, min * 2);
    off = +off.toFixed(dp); const f = x => x.toFixed(dp);
    if (B.barrier === 2) return { barrier: '+' + f(off), barrier2: '-' + f(off), off };
    if (bot === 'hl') return { barrier: (side === 'higher' ? '-' : '+') + f(off), off };
    const d = dir || 1, sign = side === 'touch' ? d : -d;
    return { barrier: (sign >= 0 ? '+' : '-') + f(off), off };
  }
  /** Starting guess: k·σ·√T (T in ticks). manual = points typed by the user. */
  function barrierFor(bot, side, m, dur, unit, manual, pip, dir) {
    const B = BOTS[bot]; if (!B.barrier) return {};
    const T = unit === 't' ? dur : (dur * { s: 1, m: 60, h: 3600 }[unit]) / Math.max(0.5, (m && m.dt) || 1);
    const off = manual > 0 ? manual : (B.k[side] || 0.7) * ((m && m.sd) || 0) * Math.sqrt(T);
    return barrierStr(bot, side, off, pip, dir);
  }
  /** Find the barrier offset whose live quote pays `target` % (profit ÷ stake).
   *  quoteAt(off) → { ratio, prop } | { near: true } (barrier too close) ; throws on other errors.
   *  "offers no return" is reported by quoteAt as ratio 0. Payout is monotonic in the offset, so this
   *  brackets the target and bisects (geometric) / interpolates, honouring the barrier decimals.
   *  Returns { off, ratio, prop, tries, hit } with the closest quote, or null when the target is out of reach. */
  async function searchBarrier(quoteAt, o) {
    const dec = o.dec, T = o.target / 100, tol = (o.tol == null ? 1.5 : o.tol) / 100, step = Math.pow(10, -(o.pip == null ? 2 : o.pip));
    const maxTries = o.maxTries || 8, reach = (o.reach == null ? 5 : o.reach) / 100;
    let lo = 0, hi = Infinity, best = null, x = Math.max(step * 2, +o.start || step * 10), tries = 0; const seen = new Map();
    const rnd = v => Math.max(step * 2, Math.round(v / step) * step);
    while (tries < maxTries) {
      x = rnd(x); if (seen.has(x.toFixed(8))) break; tries++;
      const q = await quoteAt(x); seen.set(x.toFixed(8), q);
      let needFarther;
      if (q.near) needFarther = true;
      else {
        if (q.ratio > 0 && (!best || Math.abs(q.ratio - T) < Math.abs(best.ratio - T))) best = { off: x, ratio: q.ratio, prop: q.prop };
        if (q.ratio > 0 && Math.abs(q.ratio - T) <= tol) return Object.assign(best, { tries, hit: true });
        needFarther = dec ? q.ratio > T : q.ratio < T;
        q.x = x;
      }
      if (needFarther) lo = Math.max(lo, x); else hi = Math.min(hi, x);
      if (hi - lo <= step * 1.01) break;
      // next point: interpolate in log-space between bracketing quotes when we have both, else expand ×1.7
      const pts = [...seen.values()].filter(z => z.x != null && z.ratio > 0);
      const a = pts.filter(z => z.x <= lo + 1e-12).sort((u, v) => v.x - u.x)[0], b = pts.filter(z => z.x >= hi - 1e-12).sort((u, v) => u.x - v.x)[0];
      let nx; const lt = Math.log(T);
      if (hi === Infinity || lo === 0) { // one-sided so far: secant on log(payout) over the last two live quotes, else ×/÷ 2.5
        const up = hi === Infinity, rec = pts.slice(-2);
        if (rec.length === 2 && rec[0].x !== rec[1].x && rec[0].ratio !== rec[1].ratio) {
          const [u, v] = rec, sl = (Math.log(v.ratio) - Math.log(u.ratio)) / (v.x - u.x); nx = v.x + (lt - Math.log(v.ratio)) / sl;
        }
        if (!(nx > 0) || (up && nx <= x) || (!up && nx >= x)) nx = up ? x * 2.5 : x / 2.5;
        nx = up ? Math.min(nx, x * 8) : Math.max(nx, x / 8);
      }
      else if (a && b && a.ratio !== b.ratio) { const la = Math.log(a.ratio), lb = Math.log(b.ratio); nx = a.x + (b.x - a.x) * (lt - la) / (lb - la); if (!(nx > lo && nx < hi)) nx = Math.sqrt(lo * hi); }
      else nx = Math.sqrt(lo * hi);
      x = nx;
    }
    if (best && Math.abs(best.ratio - T) <= reach) return Object.assign(best, { tries, hit: Math.abs(best.ratio - T) <= tol });
    return null;
  }

  function proposalReq(bot, side, sym, stake, dur, unit, bar) {
    const q = { proposal: 1, amount: r2(stake), basis: 'stake', currency: 'USD', contract_type: BOTS[bot].ct[side], duration: dur, duration_unit: unit, underlying_symbol: sym };
    if (bar && bar.barrier) q.barrier = bar.barrier; if (bar && bar.barrier2) q.barrier2 = bar.barrier2;
    return q;
  }
  const ratioOf = p => { const ask = +(p.ask_price || p.display_value || 0), pay = +p.payout; return ask > 0 && pay > 0 ? (pay - ask) / ask : 0; };

  function newState() { return { sessionPL: 0, wins: 0, losses: 0, consec: 0, lossRun: 0, baseRatio: 0, trades: 0 }; }
  /** Martingale. Manual: stake × mart^losses-in-a-row. Auto: size the stake from the live
   *  payout ratio so one win pays back every loss since the last win plus the normal profit. */
  function nextStake(st, s, ratio) {
    let stake;
    if (st.consec === 0) stake = s.stake;
    else if (s.mart > 0) stake = s.stake * Math.pow(s.mart, st.consec);
    else { const r = ratio || st.baseRatio || 1; stake = (st.lossRun + s.stake * (st.baseRatio || r)) / r; }
    if (s.smart && st.consec > 0) { const room = s.sl - Math.max(0, -st.sessionPL); if (stake > room) stake = Math.max(s.stake, room); }
    return Math.max(MIN_STAKE, st.consec === 0 ? r2(stake) : ceil2(stake));
  }
  function applyResult(st, pl) {
    st.trades++; st.sessionPL = r2(st.sessionPL + pl);
    if (pl >= 0) { st.wins++; st.consec = 0; st.lossRun = 0; } else { st.losses++; st.consec++; st.lossRun = r2(st.lossRun - pl); }
    return st;
  }
  function checkStop(st, s) {
    if (st.sessionPL >= s.tp - 1e-9) return 'tp';
    if (-st.sessionPL >= s.sl - 1e-9) return 'sl';
    if (s.steps > 0 && st.consec >= s.steps) return 'steps';
    return null;
  }
  const mart0 = x => { const v = String(x == null ? '' : x).trim(); return /^auto$/i.test(v) || v === '' ? 0 : Math.max(1, +v || 0); };

  /* Runner: one bot session. io = { send(req) → Promise<msg>, scan() → Promise<scans>, log(ev), sleep(ms) } */
  class Runner {
    constructor(bot, io, settings) { this.bot = bot; this.io = io; this.s = settings; this.st = newState(); this.running = false; this.hist = []; this.alt = 0; }
    plan(scans) {
      const s = this.s, B = BOTS[this.bot];
      if (s.withSignal) return pickSignal(this.bot, s.side, scans);
      const x = scans.find(z => z.sym === s.market); if (!x || !x.m) return null;
      const side = s.side === 'both' ? B.sides[(this.alt++) % 2][0] : s.side;
      if (x.ok && x.ok[side] === false) return null;
      return { side, sym: x.sym, name: x.name, scan: x, dir: x.m.dir };
    }
    /** Quote one trade. Auto barrier: search (or reuse the ≤60 s cached offset) so the payout at THIS stake
     *  matches the target. Manual: the typed offset. Returns null when Auto can't reach the target here. */
    async quote(p, stake, fixedOff) {
      const s = this.s, x = p.scan, bot = this.bot, B = BOTS[bot];
      const ask = async bar => this.io.send(proposalReq(bot, p.side, p.sym, stake, s.dur, s.unit, bar));
      if (!B.barrier || !s.autoBarrier || fixedOff != null) {
        const bar = fixedOff != null ? barrierStr(bot, p.side, fixedOff, x.pip, p.dir) : barrierFor(bot, p.side, x.m, s.dur, s.unit, s.barrier, x.pip, p.dir);
        const r = await ask(bar); return { prop: r.proposal, bar, ratio: ratioOf(r.proposal) };
      }
      const target = (s.targets && s.targets[p.side]) || TARGET[bot][p.side];
      const key = [p.sym, p.side, s.dur, s.unit].join('|'); this.cache = this.cache || {}; const c = this.cache[key];
      const start = c && Date.now() - c.t < 60000 ? c.off : barrierFor(bot, p.side, x.m, s.dur, s.unit, 0, x.pip, p.dir).off;
      let n = 0; const quoteAt = async off => {
        if (n++) await this.io.sleep(200); // gentle on Deriv's proposal rate limit
        try { const r = await ask(barrierStr(bot, p.side, off, x.pip, p.dir)); return { ratio: ratioOf(r.proposal), prop: r.proposal }; }
        catch (e) { const m = String(e.message || e); if (/at least|too close|minimum/i.test(m)) return { near: true }; if (/no return/i.test(m)) return { ratio: 0 }; throw e; }
      };
      const f = await searchBarrier(quoteAt, { dec: fartherPaysLess(bot, p.side), target, start, pip: x.pip, tol: s.tol, maxTries: c ? 6 : 8 });
      if (!f) { delete this.cache[key]; return null; }
      this.cache[key] = { off: f.off, t: Date.now() };
      return { prop: f.prop, bar: barrierStr(bot, p.side, f.off, x.pip, p.dir), ratio: f.ratio, target, tries: f.tries };
    }
    async tradeOnce() {
      let scans = await this.io.scan(), p = null, q = null, stake = 0; this.skip = this.skip || {};
      const now = Date.now(), skipKey = (sym, side) => sym + '|' + side;
      for (let tryN = 0; tryN < 4; tryN++) {
        const usable = scans.map(z => { const ok = Object.assign({}, z.ok); BOTS[this.bot].sides.forEach(([k]) => { if ((this.skip[skipKey(z.sym, k)] || 0) > now) ok[k] = false; }); return Object.assign({}, z, { ok }); });
        p = this.plan(usable);
        if (!p || !p.scan || !p.scan.m) { this.io.log({ type: 'wait', text: 'Waiting for signal' }); return null; }
        const auto = !(this.s.mart > 0) && this.st.consec > 0;
        const tgt = this.s.autoBarrier && BOTS[this.bot].barrier ? ((this.s.targets && this.s.targets[p.side]) || TARGET[this.bot][p.side]) / 100 : 0;
        stake = nextStake(this.st, this.s, auto && tgt ? tgt : undefined); // recovery: size for the target payout first
        q = await this.quote(p, stake);
        if (q) break;
        this.skip[skipKey(p.sym, p.side)] = now + 60000;
        this.io.log({ type: 'skip', sym: p.sym, side: p.side, text: 'Target payout not reachable on ' + p.name });
        if (!this.s.withSignal) return null;
      }
      if (!q) return null;
      if (this.st.consec === 0) this.st.baseRatio = q.ratio;
      else if (!(this.s.mart > 0)) { // auto martingale: re-size from the real quote, keep the found barrier
        const need = this.st.lossRun + this.s.stake * this.st.baseRatio, keep = q.bar.off != null ? q.bar.off : null, tgt = q.target;
        for (let i = 0; i < 3; i++) {
          let st2 = nextStake(this.st, this.s, q.ratio); if (st2 === stake && stake * q.ratio + 1e-9 < need && !this.s.smart) st2 = r2(stake + 0.01);
          if (st2 === stake) break; stake = st2; q = Object.assign(await this.quote(p, stake, keep), { target: tgt });
        }
      }
      const ask = +q.prop.ask_price;
      this.io.log({ type: 'open', side: p.side, sym: p.sym, name: p.name, stake, ratio: q.ratio, target: q.target, tries: q.tries, off: q.bar.off, barrier: q.bar.barrier, barrier2: q.bar.barrier2, ct: BOTS[this.bot].ct[p.side] });
      const b = await this.io.send({ buy: q.prop.id, price: ask });
      const id = b.buy.contract_id, row = { id, side: p.side, sym: p.sym, stake: ask, ratio: q.ratio, target: q.target, off: q.bar.off, barrier: q.bar.barrier, barrier2: q.bar.barrier2, ct: BOTS[this.bot].ct[p.side], t: Date.now(), status: 'Open' };
      this.open = row; this.io.log({ type: 'bought', row });
      const c = await this.waitSettle(id);
      let pl = Number(c.profit); if (isNaN(pl)) pl = Number(c.sell_price || 0) - ask;
      row.pl = r2(pl); row.status = pl >= 0 ? 'Won' : 'Lost'; row.entry = c.entry_spot || c.entry_tick; row.exit = c.exit_spot || c.exit_tick || c.sell_spot;
      row.payout = +c.payout || null; this.open = null;
      applyResult(this.st, row.pl); this.hist.unshift(row); if (this.hist.length > 50) this.hist.pop();
      this.io.log({ type: 'settled', row, st: Object.assign({}, this.st) });
      return row;
    }
    async waitSettle(id) {
      const lim = (this.s.unit === 't' ? this.s.dur * 3 : this.s.dur * { s: 1, m: 60, h: 3600 }[this.s.unit]) + 90;
      for (let i = 0; i < lim; i++) {
        await this.io.sleep(1000);
        let r; try { r = await this.io.send({ proposal_open_contract: 1, contract_id: id }); } catch (e) { continue; }
        const c = r.proposal_open_contract || {}; const st = String(c.status || '').toLowerCase();
        if (c.is_sold || st === 'won' || st === 'lost' || st === 'sold') return c;
      }
      throw new Error('Contract did not settle in time');
    }
    async run() {
      this.running = true; let err = 0;
      while (this.running) {
        try { const row = await this.tradeOnce(); err = 0;
          if (row) { const why = checkStop(this.st, this.s); if (why) { this.running = false; this.io.log({ type: 'stop', why, st: Object.assign({}, this.st) }); break; } }
          await this.io.sleep(row ? 1500 : 3000);
        } catch (e) { if (this.open) { this.running = false; this.io.log({ type: 'error', text: String(e.message || e), fatal: true }); break; }
          err++; this.io.log({ type: 'error', text: String(e.message || e) }); if (err >= 6) { this.running = false; this.io.log({ type: 'stop', why: 'errors' }); break; } await this.io.sleep(2500); }
      }
      return this.st;
    }
    stop() { this.running = false; }
  }

  /* Market scanner shared by all six bots: one pass over the markets every ~12 s. */
  function Scanner(io, symbols) {
    const avail = {}, cache = {}; let last = 0, busy = null;
    async function one(x, count) {
      if (!avail[x.value]) { try { const r = await io.send({ contracts_for: x.value }); avail[x.value] = (r.contracts_for && r.contracts_for.available) || []; } catch (e) { avail[x.value] = []; } }
      const h = await io.send({ ticks_history: x.value, count: Math.max(20, Math.min(1000, count)), end: 'latest', style: 'ticks' });
      const hp = (h.history && h.history.prices) || [], ht = (h.history && h.history.times) || [];
      return { sym: x.value, name: x.name, pip: h.pip_size != null ? h.pip_size : 2, m: analyzeTicks(hp.map(Number), ht.map(Number)), avail: avail[x.value] };
    }
    return {
      avail,
      async scan(count, force) {
        if (!force && Date.now() - last < 12000 && cache.list && cache.count === count) return cache.list;
        if (busy) return busy;
        busy = (async () => { const out = [];
          for (const x of symbols) { try { out.push(await one(x, count)); } catch (e) { } }
          cache.list = out; cache.count = count; last = Date.now(); busy = null; return out; })();
        return busy;
      }
    };
  }
  /** Mark which markets can trade the bot's contract at this duration. */
  function withSupport(bot, scans, dur, unit) {
    const B = BOTS[bot];
    return scans.map(x => { const ok = {}; B.sides.forEach(([k]) => { ok[k] = supports(x.avail, B.ct[k], dur, unit); }); return Object.assign({}, x, { ok }); })
      .filter(x => B.sides.some(([k]) => x.ok[k]));
  }

  const CORE = { BOTS, TARGET, fartherPaysLess, barrierStr, searchBarrier, analyzeTicks, supports, parseDur, topSignals, pickSignal, barrierFor, proposalReq, ratioOf, newState, nextStake, applyResult, checkStop, mart0, Runner, Scanner, withSupport };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  root.ADBCore = CORE;
  if (typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  const $ = id => document.getElementById(id);
  const SYMS = () => (typeof SCAN_SYMBOLS !== 'undefined' ? SCAN_SYMBOLS : [{ value: '1HZ25V', name: 'Volatility 25 (1s)' }]);
  const PUB = 'wss://api.derivws.com/trading/v1/options/ws/public';
  const UNIT_TXT = { t: 'Ticks', s: 'Seconds', m: 'Minutes', h: 'Hours' };
  const IDS = Object.keys(BOTS);

  // public socket for the scanner (works before the account is connected)
  const pub = { ws: null, id: 1, pend: {}, opening: null };
  function pubOpen() {
    if (pub.ws && pub.ws.readyState === 1) return Promise.resolve();
    if (pub.opening) return pub.opening;
    pub.opening = new Promise((res, rej) => { const w = new WebSocket(PUB); pub.ws = w; const t = setTimeout(() => rej(new Error('Scan offline')), 10000);
      w.onopen = () => { clearTimeout(t); pub.opening = null; res(); };
      w.onclose = () => { pub.opening = null; Object.values(pub.pend).forEach(p => p.rej(new Error('closed'))); pub.pend = {}; };
      w.onerror = () => { clearTimeout(t); pub.opening = null; rej(new Error('Scan offline')); };
      w.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } const p = pub.pend[m.req_id]; if (!p) return; delete pub.pend[m.req_id]; m.error ? p.rej(new Error(m.error.message || 'Error')) : p.res(m); }; });
    return pub.opening;
  }
  const pubIO = { async send(q) { await pubOpen(); return new Promise((res, rej) => { const id = pub.id++; pub.pend[id] = { res, rej }; pub.ws.send(JSON.stringify(Object.assign({}, q, { req_id: id }))); setTimeout(() => { if (pub.pend[id]) { delete pub.pend[id]; rej(new Error('Timeout')); } }, 15000); }); } };
  const scanner = Scanner(pubIO, SYMS());
  let scanTicks = 100;

  // trade socket (same REST → OTP flow as the other bots; token stays on this device)
  const T = { ws: null, id: 1, pend: {}, ok: false };
  const getToken = () => localStorage.getItem('deriv_access_token');
  async function api(path, opts) {
    const token = getToken(); if (!token) throw new Error('Connect your account first');
    const res = await fetch('https://api.derivws.com' + path, Object.assign({}, opts, { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Deriv-App-ID': '34RU3QCnEXwrEcu4GdFMY' } }));
    const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.message || 'API error'); return d;
  }
  const isReal = () => !!document.querySelector('.wallet-pill')?.classList.contains('real');
  async function tradeOpen() {
    if (T.ws && T.ws.readyState === 1 && T.mode === (isReal() ? 'real' : 'demo')) return;
    const list = (await api('/trading/v1/options/accounts')).data || [];
    const acc = isReal() ? list.find(a => a.account_type === 'real') : (list.find(a => a.account_type === 'demo') || list[0]);
    if (!acc) throw new Error(isReal() ? 'No real account' : 'No account');
    const otp = await api('/trading/v1/options/accounts/' + (acc.account_id || acc.loginid) + '/otp', { method: 'POST', body: '{}' });
    const url = otp.url || otp.ws_url || (otp.data && otp.data.url); if (!url) throw new Error('No trade socket');
    if (T.ws) try { T.ws.close(); } catch (_) { }
    await new Promise((res, rej) => { const w = new WebSocket(url); T.ws = w; const t = setTimeout(() => rej(new Error('Socket timeout')), 10000);
      w.onopen = () => { clearTimeout(t); T.ok = true; T.mode = isReal() ? 'real' : 'demo'; res(); };
      w.onclose = () => { T.ok = false; Object.values(T.pend).forEach(p => p.rej(new Error('Trade offline'))); T.pend = {}; };
      w.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } const p = T.pend[m.req_id]; if (!p) return; delete T.pend[m.req_id]; m.error ? p.rej(new Error(m.error.message || 'Error')) : p.res(m); }; });
  }
  // reconnects once if the trade socket dropped (e.g. phone slept) so an open contract can still be read back
  async function tsend(q) { if (!T.ws || T.ws.readyState !== 1) { try { await tradeOpen(); } catch (e) { throw new Error('Trade offline'); } } return tsend1(q); }
  function tsend1(q) { return new Promise((res, rej) => { if (!T.ws || T.ws.readyState !== 1) return rej(new Error('Trade offline')); const id = T.id++; T.pend[id] = { res, rej }; T.ws.send(JSON.stringify(Object.assign({}, q, { req_id: id }))); setTimeout(() => { if (T.pend[id]) { delete T.pend[id]; rej(new Error('Timeout')); } }, 15000); }); }

  function panelHTML(id) {
    const B = BOTS[id], [a, b] = B.sides, dir = B.sig === 'dir';
    const L = dir ? ['Most Rise', 'Most Fall'] : ['Most Ranging', 'Most Trending'];
    const units = B.units.map(u => `<option value="${u}"${u === B.dur[1] ? ' selected' : ''}>${UNIT_TXT[u]}</option>`).join('');
    return `<div class="rf-panel adb-panel" id="${id}Panel" data-bot="${id}">
      <div class="rf-account-mode demo" id="${id}AccountMode">DEMO</div>
      <h3>Live Signals</h3>
      <div class="rf-sig-snip"><div class="rf-sig-card rise"><div class="rf-sig-label">${L[0]}</div><div class="rf-sig-market" id="${id}SigAName">Scanning…</div><div class="rf-sig-pct" id="${id}SigAPct">—</div></div>
        <div class="rf-sig-card fall"><div class="rf-sig-label">${L[1]}</div><div class="rf-sig-market" id="${id}SigBName">Scanning…</div><div class="rf-sig-pct" id="${id}SigBPct">—</div></div></div>
      <h3>Market</h3><div class="rf-field" style="margin-bottom:14px"><select id="${id}Market"></select></div>
      <h3>Trade Type</h3><div class="rf-seg adb-seg" style="margin-bottom:14px" id="${id}SideSeg"><button type="button" data-v="${a[0]}">${a[1]}</button><button type="button" data-v="${b[0]}">${b[1]}</button><button type="button" class="active" data-v="both">Both</button></div>
      <h3>Signal Mode</h3><div class="rf-seg adb-seg adb-sig" style="margin-bottom:14px" id="${id}SigSeg"><button type="button" class="active" data-v="with">With Signal</button><button type="button" data-v="without">Without Signal</button></div>
      <div class="rf-field" style="margin-bottom:14px"><label>Ticks to Analyze</label><input type="number" id="${id}Ticks" value="100" min="20" max="1000"></div>
      <h3>Trade Parameters</h3>
      <div class="rf-row"><div class="rf-field"><label>Stake</label><input type="number" id="${id}Stake" value="0.35" min="0.35" step="0.01"></div>
        <div class="rf-field"><label>Target Profit</label><input type="number" id="${id}TP" value="1" min="0.1" step="0.1"></div>
        <div class="rf-field"><label>Stoploss</label><input type="number" id="${id}SL" value="2" min="0.1" step="0.1"></div>
        <div class="rf-field"><label>Martingale</label><input type="text" id="${id}Mart" value="Auto" inputmode="decimal"><div class="adb-hint">Auto from payout</div></div></div>
      <div class="rf-row"><div class="rf-field"><label>Martingale Steps</label><input type="number" id="${id}Steps" value="2" min="0" max="10"></div>
        <div class="rf-field"><label>Duration</label><div class="rf-dur"><input type="number" id="${id}Dur" value="${B.dur[0]}" min="1"><select id="${id}DurUnit">${units}</select></div></div>
        ${B.barrier ? `<div class="rf-field"><label class="adb-lab">Barrier<span class="adb-auto"><input type="checkbox" id="${id}BarAuto" checked aria-label="Auto barrier"><span>Auto</span></span></label><input type="text" id="${id}Barrier" value="" placeholder="Auto" inputmode="decimal" disabled><div class="adb-hint" id="${id}BarHint">Set before each trade</div></div>
        <div class="rf-field" id="${id}TgtField"><label>Target payout %</label><div class="rf-dur adb-tgt"><input type="number" id="${id}TgtA" value="${(TARGET[id] || {})[a[0]] || ''}" min="1" step="1" aria-label="${a[1]} target %"><input type="number" id="${id}TgtB" value="${(TARGET[id] || {})[b[0]] || ''}" min="1" step="1" aria-label="${b[1]} target %"></div><div class="adb-hint">${a[1]} · ${b[1]}</div></div>` : ''}</div>
      <div class="rf-switch-row"><span>Smart Martingale</span><label class="rf-switch"><input type="checkbox" id="${id}Smart"><span class="rf-slider"></span></label></div>
      <div class="rf-btns"><button type="button" class="rf-btn start" id="${id}Start">Start</button><button type="button" class="rf-btn stop" id="${id}Stop" disabled>Stop</button><button type="button" class="rf-btn reset" id="${id}Reset">Reset</button></div>
      <div class="rf-session-bar"><div class="rf-session-pill" id="${id}PillPL"><div class="sp-label">Session P/L</div><div class="sp-val" id="${id}SessPL">$0.00</div></div>
        <div class="rf-session-pill"><div class="sp-label">Wins</div><div class="sp-val" id="${id}SessWins">0</div></div><div class="rf-session-pill"><div class="sp-label">Losses</div><div class="sp-val" id="${id}SessLosses">0</div></div></div>
      <div class="rf-note" id="${id}Note">Ready. Connect account and configure, then Start.</div>
      <div class="rf-live"><div class="rf-live-label">Live</div><div class="rf-live-status" id="${id}LiveStatus">Idle</div><div class="rf-live-detail" id="${id}LiveDetail">Waiting for signal</div></div>
      <div class="rf-activity"><div class="rf-activity-head">Recent Activity</div><div class="rf-tx-wrap"><div id="${id}Hist" class="rf-tx-list"><div class="rf-tx-empty">No trades yet</div></div></div></div>
    </div>`;
  }

  const UI = {};
  function settingsOf(id) {
    const B = BOTS[id], v = k => $(id + k), seg = k => (v(k)?.querySelector('button.active') || {}).dataset?.v;
    const unit = v('DurUnit').value; let dur = Math.max(1, Math.round(+v('Dur').value || B.dur[0]));
    if (unit === 't') dur = Math.min(10, Math.max(5, dur));
    if (unit === 's') dur = Math.max(id === 'ru' ? 20 : 15, dur);
    if (unit === 'm' && (B.barrier === 2 || id === 'tn')) dur = Math.max(2, dur);
    const bar = v('Barrier') ? String(v('Barrier').value).replace(/[±+\-\s]/g, '').trim() : '';
    const autoBarrier = !!(v('BarAuto') && v('BarAuto').checked), targets = {};
    if (v('TgtA')) { targets[B.sides[0][0]] = Math.max(1, +v('TgtA').value || TARGET[id][B.sides[0][0]]); targets[B.sides[1][0]] = Math.max(1, +v('TgtB').value || TARGET[id][B.sides[1][0]]); }
    return { side: seg('SideSeg') || 'both', withSignal: seg('SigSeg') !== 'without', market: v('Market').value,
      stake: Math.max(0.35, +v('Stake').value || 0.35), tp: Math.max(0.1, +v('TP').value || 1), sl: Math.max(0.1, +v('SL').value || 2),
      mart: mart0(v('Mart').value), steps: (() => { const s = +v('Steps').value; return s === 0 ? 0 : Math.max(1, s || 2); })(),
      smart: !!v('Smart').checked, dur, unit, autoBarrier, targets, barrier: autoBarrier || /^auto$/i.test(bar) || bar === '' ? 0 : Math.abs(+bar) || 0, ticks: Math.max(20, Math.min(1000, +v('Ticks').value || 100)) };
  }
  const money = x => (x >= 0 ? '+' : '-') + '$' + Math.abs(x).toFixed(2);
  function sideLabel(id, k) { const s = BOTS[id].sides.find(z => z[0] === k); return s ? s[1] : k; }
  function render(id) {
    const u = UI[id], r = u.runner, st = r ? r.st : newState(), hist = r ? r.hist : [];
    $(id + 'SessPL').textContent = money(st.sessionPL); $(id + 'SessWins').textContent = st.wins; $(id + 'SessLosses').textContent = st.losses;
    const pill = $(id + 'PillPL'); pill.classList.toggle('profit', st.sessionPL > 0); pill.classList.toggle('loss', st.sessionPL < 0);
    const rows = (r && r.open ? [r.open] : []).concat(hist);
    $(id + 'Hist').innerHTML = rows.length ? rows.map(t => { const open = t.status === 'Open', pl = t.pl;
      const cls = /higher|up|call|touch$|^in$/.test(t.side) && t.side !== 'notouch' ? 'rise' : 'fall';
      return `<div class="rf-tx-item"><div><div class="rf-tx-main"><span class="rf-tx-type ${cls}">${sideLabel(id, t.side).toUpperCase()}</span><span class="rf-tx-ref">${String(t.id).slice(-8)}</span></div>
        <div class="rf-tx-meta">${t.sym}${t.barrier ? ' · ' + (t.barrier2 ? '±' + t.barrier.slice(1) : t.barrier) : ''} · $${Number(t.stake).toFixed(2)}${t.ratio ? ' · ' + (t.ratio * 100).toFixed(1) + '%' : ''}</div></div>
        <div class="rf-tx-right"><div class="rf-tx-pl ${pl == null ? '' : pl >= 0 ? 'pos' : 'neg'}">${pl == null ? '—' : (pl >= 0 ? '+' : '') + pl.toFixed(2)}</div><div class="rf-tx-st ${open ? 'open' : pl >= 0 ? 'won' : 'lost'}">${t.status}</div></div></div>`; }).join('')
      : '<div class="rf-tx-empty">No trades yet</div>';
  }
  const note = (id, t) => { const e = $(id + 'Note'); if (e) e.textContent = t; };
  const live = (id, s, d, c) => { const a = $(id + 'LiveStatus'), b = $(id + 'LiveDetail'); if (a) { a.textContent = s; a.className = 'rf-live-status' + (c ? ' ' + c : ''); } if (b) b.textContent = d || ''; };

  async function scanFor(id) {
    const s = settingsOf(id); scanTicks = s.ticks;
    const list = withSupport(id, await scanner.scan(s.ticks), s.dur, s.unit);
    const t = topSignals(id, list);
    if (t) { const dir = BOTS[id].sig === 'dir';
      $(id + 'SigAName').textContent = t.a.name; $(id + 'SigBName').textContent = t.b.name;
      $(id + 'SigAPct').textContent = (dir ? t.a.m.risePct : t.a.m.er * 100).toFixed(1) + '%';
      $(id + 'SigBPct').textContent = (dir ? t.b.m.fallPct : t.b.m.er * 100).toFixed(1) + '%'; }
    const hint = $(id + 'BarHint');
    if (hint && !(UI[id].runner && UI[id].runner.running) && !UI[id].lastAuto) { const x = list.find(z => z.sym === s.market) || (t && t.a); if (x && x.m) { const side = s.side === 'both' ? BOTS[id].sides[0][0] : s.side;
      const b = barrierFor(id, side, x.m, s.dur, s.unit, s.barrier, x.pip, x.m.dir);
      hint.textContent = s.autoBarrier ? 'Tuned to ' + s.targets[side] + '% each trade' : 'Fixed ±' + b.off.toFixed(x.pip) + ' · ' + x.name.replace('Volatility', 'Vol'); } }
    return list;
  }
  let scanTimer = null;
  function scanLoop() { clearTimeout(scanTimer); const open = IDS.filter(id => $(id + 'Panel')?.classList.contains('open') || (UI[id].runner && UI[id].runner.running));
    if (!open.length || document.hidden) { scanTimer = setTimeout(scanLoop, 4000); return; }
    Promise.all(open.map(id => scanFor(id).catch(() => { }))).finally(() => { scanTimer = setTimeout(scanLoop, 12000); }); }

  function popup(type, title, amount, sub) {
    const p = $('rfPopup'), box = $('rfPopupBox'); if (!p || !box) return; const ok = type === 'profit';
    p.classList.remove('closing'); box.className = 'rf-popup-box ' + (ok ? 'profit' : 'loss');
    if ($('rfPopupTitle')) $('rfPopupTitle').textContent = title; if ($('rfPopupSub')) $('rfPopupSub').textContent = sub || '';
    if ($('rfPopupAmount')) { $('rfPopupAmount').textContent = amount; $('rfPopupAmount').className = 'rf-popup-amount ' + (ok ? 'green' : 'red'); }
    if ($('rfPopupAnim')) $('rfPopupAnim').textContent = ok ? '✓' : type === 'sl' ? '✕' : '!';
    p.style.display = 'flex'; p.classList.add('show');
  }
  async function refreshBalance() { try { const list = (await api('/trading/v1/options/accounts')).data || []; const acc = list.find(a => a.account_type === (isReal() ? 'real' : 'demo')) || list[0];
    const el = document.querySelector('.wallet-bal'); if (acc && el) el.textContent = Number(acc.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (acc.currency || 'USD'); } catch (_) { } }

  function setRunning(id, on) { $(id + 'Start').disabled = on; $(id + 'Stop').disabled = !on;
    $(id + 'Panel').querySelectorAll('input,select,.adb-seg button').forEach(e => { e.disabled = on; }); syncAuto(id); }
  /** Auto on: barrier box greyed and shows the last tuned value; off: user types the offset (points). */
  function syncAuto(id) { const t = $(id + 'BarAuto'), inp = $(id + 'Barrier'); if (!t || !inp) return; const on = t.checked, run = !!(UI[id].runner && UI[id].runner.running);
    inp.disabled = on || run; inp.placeholder = on ? 'Auto' : 'Points';
    const tf = $(id + 'TgtField'); if (tf) { tf.classList.toggle('adb-off', !on); tf.querySelectorAll('input').forEach(e => { e.disabled = !on || run; }); }
    const la = UI[id].lastAuto; if (on) inp.value = la ? '±' + la.off : ''; else if (!inp.value || /±/.test(inp.value)) inp.value = la ? String(la.off) : ''; }
  async function start(id) {
    if (!getToken()) return note(id, 'Connect your account first');
    const u = UI[id]; if (u.runner && u.runner.running) return;
    try { note(id, 'Connecting trade socket…'); await tradeOpen(); } catch (e) { return note(id, 'Start failed: ' + (e.message || e)); }
    const s = settingsOf(id), prev = u.runner;
    const io = { send: tsend, sleep: ms => new Promise(r => setTimeout(r, ms)), scan: () => scanFor(id), log: ev => onEvent(id, ev) };
    const r = new Runner(id, io, s); if (prev && !u.fresh) { r.st = prev.st; r.hist = prev.hist; } u.fresh = false; u.runner = r;
    setRunning(id, true); note(id, 'Bot running · ' + (s.withSignal ? 'with signal' : 'without signal')); scanLoop();
    r.run().then(() => setRunning(id, false));
  }
  function onEvent(id, ev) {
    if (ev.type === 'wait') { live(id, 'Idle', 'Waiting for signal'); return; }
    if (ev.type === 'open') { live(id, 'Attempting', 'Placing ' + sideLabel(id, ev.side).toUpperCase(), 'attempt');
      if (ev.off != null && $(id + 'BarAuto') && $(id + 'BarAuto').checked) { UI[id].lastAuto = { off: ev.off }; $(id + 'Barrier').value = '±' + ev.off; const h = $(id + 'BarHint'); if (h) h.textContent = (ev.ratio * 100).toFixed(1) + '% · ' + String(ev.name || ev.sym).replace('Volatility', 'Vol'); }
      return; }
    if (ev.type === 'skip') { note(id, ev.text + ' · trying the next market'); return; }
    if (ev.type === 'bought') { const t = ev.row; live(id, sideLabel(id, t.side).toUpperCase() + ' open', 'Stake $' + t.stake.toFixed(2), 'open');
      note(id, 'Open ' + sideLabel(id, t.side) + ' · ' + t.sym + ' · $' + t.stake.toFixed(2)); render(id); return; }
    if (ev.type === 'settled') { const t = ev.row, st = ev.st; render(id); refreshBalance();
      live(id, 'Closed', (t.pl >= 0 ? '+' : '') + t.pl.toFixed(2) + ' · ' + sideLabel(id, t.side), 'closed');
      note(id, (t.pl >= 0 ? 'Won +' : 'Lost ') + '$' + Math.abs(t.pl).toFixed(2) + ' · P/L $' + st.sessionPL.toFixed(2)); return; }
    if (ev.type === 'stop') { const st = ev.st || UI[id].runner.st, wl = st.wins + ' wins · ' + st.losses + ' losses';
      if (ev.why === 'tp') { note(id, 'Target profit reached'); popup('profit', 'Target Profit Reached', money(st.sessionPL), wl); }
      else if (ev.why === 'sl') { note(id, 'Stoploss hit'); popup('sl', 'Stoploss Hit', money(st.sessionPL), wl); }
      else if (ev.why === 'steps') { note(id, 'Martingale level reached'); popup('steps', 'Max Martingale Level', money(st.sessionPL), st.consec + ' losses in a row'); }
      else note(id, 'Stopped after repeated errors');
      setRunning(id, false); return; }
    if (ev.type === 'error') { note(id, 'Error: ' + ev.text); if (ev.fatal) setRunning(id, false); }
  }
  function stop(id) { const r = UI[id].runner; if (r) r.stop(); note(id, r && r.open ? 'Stopping after the open trade…' : 'Manual stop'); if (!(r && r.open)) setRunning(id, false); }
  function reset(id) { const r = UI[id].runner; if (r) r.stop(); if (r && r.open) return note(id, 'Wait for the open trade to close');
    UI[id].runner = null; UI[id].fresh = true; setRunning(id, false); render(id); live(id, 'Idle', 'Waiting for signal'); note(id, 'Reset. Ready.'); }

  function closeAll(except) {
    document.querySelectorAll('.rf-panel.open').forEach(p => { if (p.id !== except) p.classList.remove('open'); });
    document.querySelectorAll('.bot-card .bot-badge').forEach(b => { if (!except || !b.closest('#' + except.replace('Panel', 'Card'))) { if (b.textContent === 'Close') b.textContent = 'Open'; } });
  }
  function init() {
    const grid = document.querySelector('#viewBots .bot-grid'); if (!grid) return;
    let anchor = $('mdPanel') || grid;
    IDS.forEach(id => {
      const card = grid.querySelector('.bot-card.' + id); if (!card) return;
      card.id = id + 'Card'; card.style.cursor = 'pointer';
      const badge = card.querySelector('.bot-badge'); badge.id = id + 'BotBadge'; badge.textContent = 'Open';
      anchor.insertAdjacentHTML('afterend', panelHTML(id)); anchor = $(id + 'Panel');
      UI[id] = { runner: null };
      const mk = $(id + 'Market'), src = $('market');
      const fill = () => { mk.innerHTML = ''; (src ? Array.from(src.options) : SYMS().map(x => ({ value: x.value, textContent: x.name }))).forEach(o => { const e = document.createElement('option'); e.value = o.value; e.textContent = o.textContent; mk.appendChild(e); }); if (src) mk.value = src.value; };
      fill(); if (src) src.addEventListener('change', () => { if (!(UI[id].runner && UI[id].runner.running)) fill(); });
      $(id + 'Panel').querySelectorAll('.adb-seg').forEach(seg => seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { seg.querySelectorAll('button').forEach(z => z.classList.toggle('active', z === b)); scanFor(id).catch(() => { }); })));
      $(id + 'DurUnit').addEventListener('change', () => { const u = $(id + 'DurUnit').value; $(id + 'Dur').value = u === 't' ? 5 : u === 's' ? 20 : u === 'm' ? (BOTS[id].barrier === 2 ? 2 : 1) : 1; });
      ['Ticks', 'Dur', 'DurUnit', 'Barrier', 'Market'].forEach(k => $(id + k) && $(id + k).addEventListener('change', () => scanFor(id).catch(() => { })));
      card.addEventListener('click', e => { e.stopPropagation(); const p = $(id + 'Panel'); closeAll(id + 'Panel'); const open = p.classList.toggle('open'); badge.textContent = open ? 'Close' : 'Open';
        if (open) { scanFor(id).catch(() => { }); setTimeout(() => p.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); } });
      if ($(id + 'BarAuto')) { $(id + 'BarAuto').addEventListener('change', () => { syncAuto(id); scanFor(id).catch(() => { }); }); syncAuto(id); }
      $(id + 'Start').onclick = () => start(id); $(id + 'Stop').onclick = () => stop(id); $(id + 'Reset').onclick = () => reset(id);
    });
    // the four original cards: opening one closes ours
    ['rfCard', 'eoCard', 'ouCard', 'mdCard'].forEach(c => { const el = $(c); if (el) el.addEventListener('click', () => IDS.forEach(id => { const p = $(id + 'Panel'); if (p) p.classList.remove('open'); const b = $(id + 'BotBadge'); if (b) b.textContent = 'Open'; }), true); });
    // account badge mirrors the wallet (gold on Real)
    const src = $('rfAccountMode'); const sync = () => IDS.forEach(id => { const e = $(id + 'AccountMode'); if (e && src) { e.textContent = src.textContent; e.className = src.className; } });
    if (src) new MutationObserver(sync).observe(src, { attributes: true, childList: true, characterData: true, subtree: true }); sync();
    scanLoop(); initTrending();
  }
  /* Home · Trending: same trend % the range bots use (net move ÷ total distance over the analysed ticks). */
  function initTrending() {
    const sig = $('signalCard'); if (!sig || $('trendCard')) return;
    const css = document.createElement('style');
    css.textContent = '#trendCard{margin-top:12px}.tr-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tr-cell{border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--bg3);min-width:0}'
      + '.tr-lab{font-size:10px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--muted)}.tr-mk{font-size:14px;font-weight:700;margin:4px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
      + '.tr-v{font-size:12px;font-weight:800;display:flex;align-items:center;gap:6px}.tr-v .up{color:var(--green)}.tr-v .dn{color:var(--red)}.tr-v .fl{color:var(--muted)}.tr-bar{height:4px;border-radius:3px;background:var(--line);margin-top:6px;overflow:hidden}.tr-bar i{display:block;height:100%;background:var(--green)}'
      + '.tr-info{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.4}.tr-i{cursor:pointer;color:var(--muted);font-weight:700;border:1px solid var(--line2);border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:11px}';
    document.head.appendChild(css);
    sig.insertAdjacentHTML('afterend', `<div class="card full" id="trendCard"><div class="card-title"><span>Trending</span><span class="tr-i" id="trInfoBtn" role="button" aria-label="How is this calculated?">i</span></div>
      <div class="tr-grid"><div class="tr-cell"><div class="tr-lab">Most trending</div><div class="tr-mk" id="trTopName">Scanning…</div><div class="tr-v" id="trTopVal">—</div><div class="tr-bar"><i id="trTopBar" style="width:0"></i></div></div>
      <div class="tr-cell"><div class="tr-lab">Least trending</div><div class="tr-mk" id="trLowName">Scanning…</div><div class="tr-v" id="trLowVal">—</div><div class="tr-bar"><i id="trLowBar" style="width:0"></i></div></div></div>
      <div class="tr-info" id="trInfo" hidden></div></div>`);
    $('trInfoBtn').onclick = () => { const e = $('trInfo'); e.hidden = !e.hidden; };
    const ticks = () => Math.max(20, Math.min(1000, +($('ticks') && $('ticks').value) || 100));
    const arrow = x => x.m.er < 0.05 ? '<span class="fl">↔</span>' : x.m.dir > 0 ? '<span class="up">▲</span>' : '<span class="dn">▼</span>';
    const put = (k, x) => { $('tr' + k + 'Name').textContent = x.name; $('tr' + k + 'Val').innerHTML = arrow(x) + ' ' + (x.m.er * 100).toFixed(1) + '%'; $('tr' + k + 'Bar').style.width = Math.min(100, x.m.er * 100).toFixed(0) + '%'; };
    let timer = null;
    async function tick() {
      clearTimeout(timer); const home = $('viewHome');
      if (!document.hidden && home && !home.hidden && !document.body.classList.contains('ats-open')) {
        try { const n = ticks(); const list = (await scanner.scan(n)).filter(x => x && x.m);
          if (list.length) { const top = list.reduce((a, b) => (b.m.er > a.m.er ? b : a)), low = list.reduce((a, b) => (b.m.er < a.m.er ? b : a)); put('Top', top); put('Low', low);
            $('trInfo').textContent = 'Trend % = how directly price moved over the last ' + n + ' ticks: net move ÷ total distance travelled tick by tick. 100% = straight line, near 0% = went back and forth (ranging). Arrow = direction of the net move. Same value the Touch, Ends and Stays bots use.'; } } catch (_) { }
      }
      timer = setTimeout(tick, 12000);
    }
    tick();
    if ($('ticks')) $('ticks').addEventListener('change', () => setTimeout(tick, 300));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  root.ADB = { UI, scanFor, start, stop, reset, settingsOf };
})(typeof window !== 'undefined' ? window : globalThis);
