const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../analyzer-bots.js');
const mk = (sym, m, ok) => ({ sym, name: sym, pip: 2, m, ok });
const M = (risePct, fallPct, er, dir = 1, sd = 40, dt = 1) => ({ risePct, fallPct, er, dir, sd, dt, n: 100 });

test('six bots map to the right Deriv contract types', () => {
  const want = { hl: ['HIGHER', 'LOWER'], tn: ['ONETOUCH', 'NOTOUCH'], ei: ['EXPIRYRANGE', 'EXPIRYMISS'], sg: ['RANGE', 'UPORDOWN'], as: ['ASIANU', 'ASIAND'], ru: ['RESETCALL', 'RESETPUT'] };
  for (const [k, v] of Object.entries(want)) assert.deepEqual(C.BOTS[k].sides.map(s => C.BOTS[k].ct[s[0]]), v);
});
test('analyzeTicks: rise/fall %, efficiency ratio, sigma, interval', () => {
  const up = C.analyzeTicks([1, 2, 3, 4, 5], [0, 1, 2, 3, 4]);
  assert.equal(up.risePct, 100); assert.equal(up.er, 1); assert.equal(up.dir, 1); assert.equal(up.sd, 0); assert.equal(up.dt, 1);
  const chop = C.analyzeTicks([1, 2, 1, 2, 1], [0, 2, 4, 6, 8]);
  assert.equal(chop.risePct, 50); assert.equal(chop.fallPct, 50); assert.equal(chop.er, 0); assert.equal(chop.sd, 1); assert.equal(chop.dt, 2);
  assert.equal(C.analyzeTicks([1, 2]), null);
});
test('dir signal: Most Rise for side A, Most Fall for side B, Both = bigger %', () => {
  const s = [mk('A', M(60, 40, .1)), mk('B', M(45, 55, .1)), mk('C', M(30, 68, .2, -1))];
  assert.equal(C.pickSignal('hl', 'higher', s).sym, 'A');
  assert.equal(C.pickSignal('hl', 'lower', s).sym, 'C');
  const both = C.pickSignal('as', 'both', s); assert.equal(both.side, 'down'); assert.equal(both.sym, 'C');
  const both2 = C.pickSignal('ru', 'both', [mk('A', M(70, 30, .1)), mk('C', M(30, 60, .1))]); assert.equal(both2.side, 'call');
  assert.equal(C.pickSignal('hl', 'both', [mk('A', M(50, 50, .1))]), null, 'tie waits');
});
test('range signal: In/No Touch on most ranging, Out/Touch on most trending', () => {
  const s = [mk('R', M(50, 50, .02)), mk('T', M(70, 30, .6, -1)), mk('X', M(50, 50, .3))];
  assert.equal(C.pickSignal('ei', 'in', s).sym, 'R'); assert.equal(C.pickSignal('ei', 'out', s).sym, 'T');
  assert.equal(C.pickSignal('sg', 'both', s).side, 'in');
  const tr = [mk('R', M(50, 50, .5)), mk('T', M(90, 10, .97))];
  assert.equal(C.pickSignal('sg', 'both', tr).side, 'out');
  const t = C.pickSignal('tn', 'touch', s); assert.equal(t.sym, 'T'); assert.equal(t.dir, -1);
  assert.equal(C.pickSignal('tn', 'notouch', s).sym, 'R');
});
test('signals skip markets that do not offer the contract', () => {
  const s = [mk('A', M(80, 20, .1), { higher: false, lower: true }), mk('B', M(60, 40, .1), { higher: true, lower: true })];
  assert.equal(C.pickSignal('hl', 'higher', s).sym, 'B');
});
test('barriers: Higher −, Lower +, Touch with the move, No Touch against it, ranges ±', () => {
  const m = M(50, 50, .1, 1, 40, 1);
  assert.equal(C.barrierFor('hl', 'higher', m, 5, 't', 0, 2).barrier, '-' + (0.6 * 40 * Math.sqrt(5)).toFixed(2));
  assert.equal(C.barrierFor('hl', 'lower', m, 5, 't', 62.5, 2).barrier, '+62.50');
  assert.match(C.barrierFor('tn', 'touch', m, 5, 't', 0, 2, -1).barrier, /^-/);
  assert.match(C.barrierFor('tn', 'notouch', m, 5, 't', 0, 2, -1).barrier, /^\+/);
  const e = C.barrierFor('ei', 'in', M(50, 50, .1, 1, 0.12, 2), 2, 'm', 0, 3);
  assert.equal(e.barrier, '+' + (0.7 * 0.12 * Math.sqrt(60)).toFixed(3)); assert.equal(e.barrier2, '-' + e.barrier.slice(1));
  assert.deepEqual(C.barrierFor('as', 'up', m, 5, 't', 0, 2), {});
});
test('proposal request shape', () => {
  const q = C.proposalReq('sg', 'out', 'R_10', 0.351, 2, 'm', { barrier: '+1', barrier2: '-1' });
  assert.deepEqual(q, { proposal: 1, amount: 0.35, basis: 'stake', currency: 'USD', contract_type: 'UPORDOWN', duration: 2, duration_unit: 'm', underlying_symbol: 'R_10', barrier: '+1', barrier2: '-1' });
  assert.equal(C.proposalReq('as', 'up', 'R_10', 1, 5, 't', {}).barrier, undefined);
});
test('auto martingale: one win pays back the losses plus the normal profit', () => {
  const s = { stake: 0.35, mart: 0, tp: 1, sl: 20, steps: 3, smart: false };
  const st = C.newState(); st.baseRatio = 0.28;
  assert.equal(C.nextStake(st, s, 0.28), 0.35);
  C.applyResult(st, -0.35);
  const k = C.nextStake(st, s, 0.28); assert.ok(k * 0.28 >= 0.35 + 0.35 * 0.28 - 1e-9); assert.equal(k, 1.6);
  C.applyResult(st, -k); const k2 = C.nextStake(st, s, 0.3); assert.ok(k2 * 0.3 >= 0.35 + 1.6 + 0.098 - 1e-9);
  C.applyResult(st, +(k2 * 0.3)); assert.equal(st.consec, 0); assert.equal(st.lossRun, 0); assert.ok(st.sessionPL > 0);
  assert.equal(C.nextStake(st, s, 0.3), 0.35);
});
test('manual martingale and smart cap', () => {
  const st = C.newState(); C.applyResult(st, -0.35); C.applyResult(st, -0.74);
  assert.equal(C.nextStake(st, { stake: 0.35, mart: 2.1, sl: 10 }), C.nextStake(st, { stake: 0.35, mart: 2.1, sl: 10 }));
  assert.equal(C.nextStake(st, { stake: 0.35, mart: 2.1, sl: 10 }), 1.55); // 0.35·2.1² = 1.5435 → 1.55
  assert.equal(C.nextStake(st, { stake: 0.35, mart: 2.1, sl: 1.5, smart: true }), 0.41); // room = 1.5 − 1.09
  assert.equal(C.mart0('Auto'), 0); assert.equal(C.mart0(''), 0); assert.equal(C.mart0('2.5'), 2.5); assert.equal(C.mart0('0.5'), 1);
  assert.equal(C.nextStake(st, { stake: 0.35, mart: 2.1, sl: 10, mgOn: false }), 0.35); // flat stake
  assert.equal(C.nextStake(st, { stake: 0.35, mart: 11, sl: 2.5, smart: true }), 1.41); // size to remaining room (2.50−1.09)
  assert.equal(C.nextStake(st, { stake: 0.35, mart: 11, sl: 1.2, smart: false }), 0); // skip rather than pass the stop
});
test('stops: TP, SL, martingale steps', () => {
  const s = { tp: 1, sl: 2, steps: 2 };
  assert.equal(C.checkStop(Object.assign(C.newState(), { sessionPL: 1.01 }), s), 'tp');
  assert.equal(C.checkStop(Object.assign(C.newState(), { sessionPL: -2 }), s), 'sl');
  assert.equal(C.checkStop(Object.assign(C.newState(), { sessionPL: -1, consec: 2 }), s), 'steps');
  assert.equal(C.checkStop(Object.assign(C.newState(), { sessionPL: 0.5, consec: 1 }), s), null);
});
test('supports() reads contracts_for durations', () => {
  const av = [{ contract_type: 'RANGE', expiry_type: 'intraday', min_contract_duration: '2m', max_contract_duration: '1d' }, { contract_type: 'ASIANU', expiry_type: 'tick', min_contract_duration: '5t', max_contract_duration: '10t' }];
  assert.equal(C.supports(av, 'RANGE', 2, 'm'), true); assert.equal(C.supports(av, 'RANGE', 1, 'm'), false);
  assert.equal(C.supports(av, 'ASIANU', 5, 't'), true); assert.equal(C.supports(av, 'ASIANU', 11, 't'), false); assert.equal(C.supports(av, 'ASIAND', 5, 't'), false);
});
test('Runner end to end with a fake broker: auto recovery + stop at TP', async () => {
  const quotes = [], buys = []; let n = 0; const results = [false, true, true, true, true, true];
  const io = { sleep: async () => { }, log: () => { },
    scan: async () => [mk('1HZ25V', M(60, 40, .1, 1, 40, 1), { higher: true, lower: true })],
    send: async q => {
      if (q.proposal) { quotes.push(q); const r = q.amount < 1 ? 0.257 : 0.28; return { proposal: { id: 'p' + quotes.length, ask_price: q.amount, payout: +(q.amount * (1 + r)).toFixed(2) } }; }
      if (q.buy) { buys.push(q); return { buy: { contract_id: 'c' + buys.length } }; }
      if (q.proposal_open_contract) { const win = results[n]; const b = buys[buys.length - 1].price, r = b < 1 ? 0.257 : 0.28; n++;
        return { proposal_open_contract: { is_sold: 1, status: win ? 'won' : 'lost', profit: win ? +(b * r).toFixed(2) : -b, payout: +(b * (1 + r)).toFixed(2) } }; }
    } };
  const r = new C.Runner('hl', io, { side: 'higher', withSignal: true, stake: 0.35, tp: 0.3, sl: 5, mart: 0, steps: 3, smart: false, dur: 5, unit: 't', barrier: 0 });
  const st = await r.run();
  assert.equal(quotes[0].contract_type, 'HIGHER'); assert.match(quotes[0].barrier, /^-/); assert.equal(quotes[0].duration, 5);
  assert.equal(buys[0].price, 0.35); assert.ok(buys[1].price > 1.5 && buys[1].price < 1.8, 'recovery ' + buys[1].price);
  assert.ok(r.hist[r.hist.length - 2].pl >= 0.35, 'recovery win covers the loss');
  assert.ok(st.sessionPL >= 0.3); assert.equal(st.consec, 0);
});

/* ---- Auto barrier: payout-targeted search ---- */
const model = (scale, dec, opts = {}) => async off => { // ratio as a smooth monotonic function of the offset
  if (opts.min && off < opts.min) return { near: true };
  const r = dec ? 0.9 * Math.exp(-off / scale) : 0.2 * Math.exp(off / scale);
  if (r < 0.02) return { ratio: 0 };
  return { ratio: +r.toFixed(4), prop: { id: 'p' + off, ask_price: 1, payout: 1 + r } };
};
test('searchBarrier hits the target within ±1.5 pts (farther pays less)', async () => {
  for (const [scale, start] of [[40, 5], [40, 400], [0.12, 0.01], [900, 3]]) {
    const f = await C.searchBarrier(model(scale, true), { dec: true, target: 25, start, pip: scale < 1 ? 3 : 2 });
    assert.ok(f && f.hit, 'scale ' + scale); assert.ok(Math.abs(f.ratio - 0.25) <= 0.015, String(f.ratio)); assert.ok(f.tries <= 8, 'tries ' + f.tries);
  }
});
test('searchBarrier works when farther pays more (Touch / Out) and past a "too close" limit', async () => {
  const f = await C.searchBarrier(model(30, false, { min: 20 }), { dec: false, target: 100, start: 5, pip: 2 });
  assert.ok(f && Math.abs(f.ratio - 1) <= 0.015, JSON.stringify(f && f.ratio)); assert.ok(f.off >= 20);
});
test('searchBarrier treats "no return" as 0 and returns null when the target is out of reach', async () => {
  assert.equal(await C.searchBarrier(model(40, true), { dec: true, target: 95, start: 10, pip: 2 }), null); // max 90 %
  const near = await C.searchBarrier(model(40, true), { dec: true, target: 89, start: 200, pip: 2, reach: 5 });
  assert.ok(near && near.ratio > 0.84);
});
test('barrierStr: signs and decimals', () => {
  assert.deepEqual(C.barrierStr('hl', 'higher', 62.456, 2), { barrier: '-62.46', off: 62.46 });
  assert.equal(C.barrierStr('hl', 'lower', 1, 3).barrier, '+1.000');
  assert.deepEqual(C.barrierStr('sg', 'in', 1.2346, 3), { barrier: '+1.235', barrier2: '-1.235', off: 1.235 });
  assert.equal(C.barrierStr('tn', 'touch', 5, 2, -1).barrier, '-5.00'); assert.equal(C.barrierStr('tn', 'notouch', 5, 2, -1).barrier, '+5.00');
  assert.equal(C.fartherPaysLess('hl', 'lower'), true); assert.equal(C.fartherPaysLess('tn', 'touch'), false); assert.equal(C.fartherPaysLess('ei', 'out'), false);
});
test('Runner auto barrier: same payout % on every market and on the recovery stake; skips unreachable markets', async () => {
  // fake broker: payout ratio depends on offset/σ of the market AND rises a bit with stake (like Deriv)
  const sd = { A: 40, B: 0.12, C: 5 }, quotes = [], buys = []; let n = 0; const results = [true, false, true, true, true, true, true];
  const ratio = (sym, off, amt) => { if (sym === 'C') return 0.05; return Math.min(0.95, 0.9 * Math.exp(-off / (sd[sym] * 2.2)) * (amt >= 1 ? 1.12 : 1)); };
  const io = { sleep: async () => { }, log: () => { },
    scan: async () => [mk('C', M(80, 20, .1, 1, 5, 1), { higher: true, lower: true }), mk('A', M(60, 40, .1, 1, 40, 1), { higher: true, lower: true }), mk('B', M(55, 52, .1, 1, 0.12, 1), { higher: true, lower: true })].map(x => (x.pip = x.sym === 'B' ? 3 : 2, x)),
    send: async q => {
      if (q.proposal) { quotes.push(q); const r = ratio(q.underlying_symbol, Math.abs(+q.barrier), q.amount); return { proposal: { id: 'p' + quotes.length, ask_price: q.amount, payout: +(q.amount * (1 + r)).toFixed(4) } }; }
      if (q.buy) { const lq = quotes[quotes.length - 1]; buys.push({ price: q.price, sym: lq.underlying_symbol, barrier: lq.barrier }); return { buy: { contract_id: 'c' + buys.length } }; }
      if (q.proposal_open_contract) { const win = results[n++], b = buys[buys.length - 1]; const r = ratio(b.sym, Math.abs(+b.barrier), b.price);
        return { proposal_open_contract: { is_sold: 1, status: win ? 'won' : 'lost', profit: win ? +(b.price * r).toFixed(2) : -b.price } }; } } };
  const r = new C.Runner('hl', io, { side: 'both', withSignal: true, stake: 0.35, tp: 0.5, sl: 5, mart: 0, steps: 3, smart: false, dur: 5, unit: 't', autoBarrier: true, targets: { higher: 25, lower: 25 } });
  await r.run();
  assert.ok(r.skip['C|higher'] > Date.now(), 'market C (max 5 %) skipped');
  for (const h of r.hist) { assert.notEqual(h.sym, 'C'); assert.ok(Math.abs(h.ratio - 0.25) <= 0.015, h.sym + ' ' + h.ratio); }
  const rec = r.hist.slice().reverse().find((h, i, a) => i > 0 && a[i - 1].pl < 0);
  assert.ok(rec && rec.stake > 1, 'recovery stake ' + (rec && rec.stake)); assert.ok(rec.pl >= 0.35 + 0.35 * 0.25 - 0.02, 'recovery covers loss + profit: ' + rec.pl);
  assert.ok(new Set(r.hist.map(h => h.sym)).size >= 1);
});
test('Runner manual barrier uses the typed points', async () => {
  const quotes = []; const io = { sleep: async () => { }, log: () => { }, scan: async () => [mk('1HZ25V', M(60, 40, .1, 1, 40, 1), { higher: true, lower: true })],
    send: async q => q.proposal ? (quotes.push(q), { proposal: { id: 'x', ask_price: q.amount, payout: q.amount * 1.3 } }) : q.buy ? { buy: { contract_id: 'c' } } : { proposal_open_contract: { is_sold: 1, status: 'won', profit: 0.1 } } };
  const r = new C.Runner('hl', io, { side: 'lower', withSignal: false, market: '1HZ25V', stake: 0.35, tp: 0.1, sl: 5, mart: 0, steps: 2, dur: 5, unit: 't', autoBarrier: false, barrier: 62.5 });
  await r.run(); assert.equal(quotes.length, 1); assert.equal(quotes[0].barrier, '+62.50');
});
