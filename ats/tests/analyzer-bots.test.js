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
  const s = { stake: 0.35, mart: 0, tp: 1, sl: 5, steps: 3, smart: false };
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
