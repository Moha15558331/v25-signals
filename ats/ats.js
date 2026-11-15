/* Auto Trading System (ATS): Rise/Fall bot on Volatility 25 (1s), running on this phone.
 * Trades go through the authenticated Deriv session (shared/deriv-account.js).
 * Demo by default. Real needs an explicit confirm and shows a REAL banner.
 * One contract at a time: buy, wait for it to settle, then decide the next one (no overlap, no duplicate buys). */
(() => {
'use strict';
const E = window.ATSEngine, DA = window.V25DerivAccount, C = window.V25Core, V = () => window.__v25 || {};
const SYM = E.SYMBOL, KEY = 'risefall', T = E.BOT;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);
const money = (x, sign) => x == null || isNaN(x) ? '—' : (sign && x > 0 ? '+' : x < 0 ? '−' : '') + '$' + Math.abs(x).toFixed(2);
const pct = x => x == null ? '—' : Math.round(x * 100) + '%';
const toast = m => (V().toast || console.log)(m);
const bhTime = ep => C.fmtBahrain(ep).slice(11, 16);
const bhStamp = ep => C.fmtBahrain(ep).slice(5, 16);
const sideName = ct => ct === 'CALL' ? 'Rise' : ct === 'PUT' ? 'Fall' : ct;
const LS = { hist: 'ats.history', params: 'ats.params.rf1', name: 'ats.name', global: 'ats.global' };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };

const SESSION = { id: Date.now().toString(36), start: now() };
let HIST = load(LS.hist, []);
const saveHist = () => { if (HIST.length > 3000) HIST = HIST.slice(-3000); save(LS.hist, HIST); };
const known = new Set(HIST.map(h => String(h.contract_id)));
const PARAMS = { [KEY]: Object.assign({}, T.defaults, load(LS.params, {})) };
const saveParams = () => save(LS.params, PARAMS[KEY]);
const GLOBAL = Object.assign({ sl: 10, tp: 6 }, load(LS.global, {}));
const BOTS = { [KEY]: { key: KEY, running: false, status: 'idle', msg: 'Idle', run: null, mode: null, open: null, live: null } };
const BOT = BOTS[KEY];
const anyRunning = () => !!(BOT.running || BOT.open);
const runningBots = () => anyRunning() ? [BOT] : [];
let view = 'bots', openBot = null, histMode = 'current';
const rfRows = rows => rows.filter(h => h.bot === KEY);
/* Server mode: the bot runs on the server; this app shows its state and sends commands (remote.js). */
const RM = () => window.ATSRemote;
const RON = () => !!(window.ATSRemote && window.ATSRemote.on());
const RSRV = () => !!(window.ATSRemote && window.ATSRemote.mode() === 'server');
const rErr = e => toast(errText(e));

/* ---------------- trade connection (one per account mode) ---------------- */
const CONNS = {};
function conn(mode) {
  if (CONNS[mode]) return CONNS[mode];
  const c = CONNS[mode] = { s: null, opening: null, lastUse: 0, mode,
    alive() { return this.s && this.s.ws && this.s.ws.readyState === 1; },
    async get() { this.lastUse = Date.now(); if (this.alive()) return this.s;
      if (!this.opening) this.opening = (async () => { const s = await DA.openTradeSession(mode); this.s = s; s.ws.addEventListener('close', () => { if (this.s === s) this.s = null; }); return s; })().finally(() => { this.opening = null; });
      return this.opening; },
    async send(req, ms) { const s = await this.get(); this.lastUse = Date.now(); return s.send(req, ms); },
    close() { if (this.s) this.s.close(); this.s = null; } };
  return c;
}
setInterval(() => { for (const c of Object.values(CONNS)) if (c.s && !anyRunning() && Date.now() - c.lastUse > 90e3) c.close(); }, 15e3);
const isApiError = e => !!(e && e.code);
const errText = e => (e && e.message) || String(e);

/** Ask Deriv to price the contract(s) this bot may buy (no purchase). Throws Deriv's own error message. */
async function preflight(p, mode) {
  const dirs = p.direction === 'up' ? ['up'] : p.direction === 'down' ? ['down'] : ['up', 'down'];
  const out = [];
  for (const dir of dirs) {
    const req = E.buildProposal(p, { stake: +p.stake, direction: dir, currency: (DA.state.accounts[mode] || {}).currency || 'USD' });
    try { const d = await conn(mode).send(req, 15000); out.push({ ct: req.contract_type, payout: +d.proposal.payout }); }
    catch (e) { throw new Error(`Deriv rejected ${sideName(req.contract_type)} ${req.duration}${req.duration_unit}: ${errText(e)}`); }
  }
  return out;
}

/* ---------------- analysis direction (timeframes follow the cycle) ---------------- */
const PRED = {}; // base gran -> {at, pred}
async function analysisDirection(cycle) {
  const tfs = E.analysisTFs(cycle || 60); const key = tfs['1h'];
  const ttl = Math.max(15e3, Math.min(60e3, (cycle || 60) * 250));
  const c = PRED[key]; let pred = c && Date.now() - c.at < ttl ? c.pred : null;
  if (!pred) {
    const client = V().client; const got = {}; const candles = {};
    for (const [slot, g] of Object.entries(tfs)) { if (!got[g]) got[g] = await client.candles(SYM, g, g === 86400 ? 300 : 1000); candles[slot] = got[g]; }
    const m1 = candles['1m'];
    pred = C.predict({ symbol: SYM, candles, price: m1.at(-1).close, epoch: m1.at(-1).epoch }, { signal_type: 'manual', source: 'ats' });
    pred.tfs = tfs; PRED[key] = { at: Date.now(), pred };
  }
  return { dir: pred.direction === 'buy' ? 'up' : pred.direction === 'sell' ? 'down' : null, pred };
}
async function decideDirection(bot) {
  const p = bot.run.p;
  if (p.direction === 'up' || p.direction === 'down') return { dir: p.direction, why: 'always ' + (p.direction === 'up' ? 'Rise' : 'Fall') };
  if (p.direction === 'alternate') { bot.alt = bot.alt === 'up' ? 'down' : 'up'; return { dir: bot.alt, why: 'alternate' }; }
  const a = await analysisDirection(E.cycleSec(p) || 60);
  const tf = E.gLabel(a.pred.tfs['1h']);
  bot.lastPred = { dir: a.dir, conf: a.pred.confidence, tf, at: now() };
  return { dir: a.dir, why: a.dir ? `analysis ${a.dir === 'up' ? 'Rise' : 'Fall'} ${a.pred.confidence}% on ${tf} candles (untested)` : `analysis neutral on ${tf} candles` };
}
/** Wait until a candle has just opened (or return at once if aligning is off / tick cycle). Returns the plan. */
async function waitForCandle(bot) {
  const p = bot.run.p, sec = E.cycleSec(p); if (!p.align || !sec) return null;
  let plan = E.alignPlan(sec, now());
  if (!plan.now) {
    bot.msg = `Waiting for the ${bhTime(plan.next)} candle open (${E.cycleLabel(p)} cycle)`; render();
    while (bot.running && Date.now() / 1000 < plan.next) await sleep(Math.min(1000, Math.max(50, (plan.next - Date.now() / 1000) * 1000)));
    plan = E.alignPlan(sec, now());
  }
  return plan;
}

/* ---------------- buy + settle ---------------- */
let buyChain = Promise.resolve();
const withBuyLock = fn => { const p = buyChain.then(fn, fn); buyChain = p.catch(() => { }); return p; };
async function reconcile(bot, pend) {
  // A buy whose reply was lost (socket dropped). Look for it on the account before doing anything else.
  for (let i = 0; i < 6; i++) {
    try {
      const c = conn(bot.mode);
      const pf = await c.send({ portfolio: 1 });
      const pt = await c.send({ profit_table: 1, limit: 15, description: 1, sort: 'DESC' });
      const rows = [...((pf.portfolio && pf.portfolio.contracts) || []), ...((pt.profit_table && pt.profit_table.transactions) || [])];
      const hit = rows.find(x => !known.has(String(x.contract_id)) && x.contract_type === pend.contract_type && (x.underlying_symbol || x.symbol) === pend.symbol && +x.purchase_time >= pend.t0);
      return hit ? { contract_id: hit.contract_id, buy_price: +hit.buy_price, payout: +hit.payout, purchase_time: +hit.purchase_time, recovered: true } : null;
    } catch (e) { await sleep(2500); }
  }
  throw new Error('Could not verify a lost buy; bot halted for safety');
}
async function placeBuy(bot, req) {
  return withBuyLock(async () => {
    if (!bot.running) return null;
    const c = conn(bot.mode);
    const prop = await c.send(req, 15000);
    const pr = prop.proposal;
    if (!pr || !pr.id) throw new Error('No proposal');
    const pend = { t0: now() - 3, contract_type: req.contract_type, symbol: req.underlying_symbol };
    bot.pendingBuy = pend;
    try {
      const b = await c.send({ buy: pr.id, price: +(+pr.ask_price).toFixed(2) }, 20000);
      return Object.assign({ payout_quote: +pr.payout }, b.buy);
    } catch (e) {
      if (isApiError(e)) throw e; // Deriv refused: nothing was bought
      bot.msg = 'Connection dropped during buy — checking the account…'; render();
      const found = await reconcile(bot, pend);
      if (found) toast(`Rise/Fall: recovered contract #${found.contract_id} after a dropped connection`);
      return found;
    } finally { bot.pendingBuy = null; }
  });
}
async function waitSettle(bot, rec) {
  let errs = 0;
  while (true) {
    try {
      const d = await conn(rec.mode).send({ proposal_open_contract: 1, contract_id: rec.contract_id }, 15000);
      const p = d.proposal_open_contract || {}; errs = 0;
      if (+p.is_sold === 1) return { profit: +p.profit, status: p.status, sell_price: +p.sell_price, exit_spot: p.exit_spot || p.exit_tick || null, entry_spot: p.entry_spot || p.entry_tick || null };
      bot.live = { profit: +p.profit, spot: p.current_spot };
      const left = (+p.date_expiry || 0) - now();
      bot.msg = `Waiting on ${sideName(rec.contract_type)} #${rec.contract_id}` + (left > 0 && left < 1e7 ? ` · ${left > 90 ? Math.round(left / 60) + 'm' : left + 's'} left` : '') + (p.profit != null ? ` · ${money(+p.profit, true)}` : '');
      render();
      await sleep(left > 60 ? 4000 : 1000);
    } catch (e) {
      errs++; bot.msg = `Reconnecting to check #${rec.contract_id}… (${errs})`; render();
      if (isApiError(e) && /not found|ContractNotFound|InvalidContract/i.test(e.code + ' ' + e.message) && errs > 5) return null;
      await sleep(Math.min(2000 * errs, 15000));
    }
  }
}
function recordOpen(bot, b, req, stake, extra) {
  const rec = { id: SESSION.id + '-' + b.contract_id, session: SESSION.id, t: +b.purchase_time || now(), bot: KEY, symbol: SYM, contract_type: req.contract_type,
    contract_id: b.contract_id, stake, buy_price: +b.buy_price || stake, payout: +b.payout || +b.payout_quote || null,
    duration: req.duration ? req.duration + req.duration_unit : req.date_expiry ? 'to ' + bhTime(req.date_expiry) : null, cycle: E.cycleLabel(bot.run.p),
    mode: bot.mode, step: bot.run.step, status: 'open', profit: null, why: extra.why || '', recovered: !!b.recovered, purchase_time: +b.purchase_time || now() };
  known.add(String(b.contract_id)); HIST.push(rec); saveHist(); return rec;
}
function recordSettle(rec, r) {
  rec.status = 'settled'; rec.profit = Math.round(r.profit * 100) / 100; rec.result = rec.profit > 0 ? 'win' : 'loss'; rec.settled_t = now(); rec.exit_spot = r.exit_spot; rec.entry_spot = r.entry_spot; saveHist();
}

function sessionRows(mode) { return HIST.filter(h => h.session === SESSION.id && (!mode || h.mode === mode)); }
/** ATS-wide session limits. With `stake`, also refuses a trade whose full loss would break the stop-loss. */
function globalCheck(mode, stake) {
  const s = E.statsOf(sessionRows(mode));
  if (s.pnl <= -GLOBAL.sl + 1e-9) return `ATS session stop-loss hit (${money(s.pnl, true)})`;
  if (s.pnl >= GLOBAL.tp - 1e-9) return `ATS session take-profit reached (${money(s.pnl, true)})`;
  if (stake != null && s.pnl - stake < -GLOBAL.sl - 1e-9) return `Next stake $${stake.toFixed(2)} could break the ATS −$${(+GLOBAL.sl).toFixed(2)} session stop-loss`;
  return null;
}

async function botLoop(bot) {
  let netErrs = 0;
  while (bot.running) {
    if (DA.state.mode !== bot.mode) { haltBot(bot, 'Account switched — stopped for safety'); break; }
    try {
      const p = bot.run.p, sec = E.cycleSec(p);
      const plan = await waitForCandle(bot);
      if (!bot.running) break;
      // limits are checked right before every buy
      const stake = bot.run.nextStake();
      if (stake == null) { haltBot(bot, bot.run.haltReason); break; }
      const g = globalCheck(bot.mode, stake); if (g) { haltBot(bot, g); break; }
      const d = await decideDirection(bot);
      if (!bot.running) break;
      if (!d.dir) {
        if (plan) { bot.msg = `Analysis is neutral on this candle — skipping to the next one`; render(); await sleepWhile(bot, Math.max(1500, (plan.date_expiry - now() - 1) * 1000)); }
        else { const w = Math.min(30, sec || 30); bot.msg = `Analysis is neutral — checking again in ${w}s`; render(); await sleepWhile(bot, w * 1000); }
        continue;
      }
      let expiry = null;
      if (plan) { expiry = plan.date_expiry; if (expiry - now() < 15) { bot.msg = 'Too late in this candle — waiting for the next one'; render(); continue; } }
      const req = E.buildProposal(p, { stake, direction: d.dir, currency: (DA.state.accounts[bot.mode] || {}).currency || 'USD', date_expiry: expiry });
      bot.msg = `Buying ${sideName(req.contract_type)} $${stake.toFixed(2)} · ${d.why}`; render();
      const b = await placeBuy(bot, req);
      if (!b) { if (bot.running) { bot.msg = 'Buy not confirmed — nothing was bought; retrying'; render(); await sleepWhile(bot, 3000); } continue; }
      netErrs = 0;
      const rec = recordOpen(bot, b, req, stake, { why: d.why }); bot.open = rec; render();
      const r = await waitSettle(bot, rec);
      bot.open = null; bot.live = null;
      if (!r) { rec.status = 'unknown'; saveHist(); haltBot(bot, `Could not read the result of #${rec.contract_id}`); break; }
      recordSettle(rec, r);
      const halt = bot.run.onResult(rec.profit);
      bot.msg = `${rec.result === 'win' ? 'Won' : 'Lost'} ${money(rec.profit, true)} on #${rec.contract_id}`; render();
      if (halt) { haltBot(bot, halt); break; }
      const g2 = globalCheck(bot.mode); if (g2) { haltBot(bot, g2); break; }
      if (!plan) await sleepWhile(bot, 1200);
    } catch (e) {
      const msg = errText(e);
      if (isApiError(e)) {
        if (/RateLimit|TooMany/i.test(e.code)) { bot.msg = 'Rate limited — pausing 10s'; render(); await sleepWhile(bot, 10000); continue; }
        haltBot(bot, 'Deriv refused: ' + msg); break;
      }
      if (/REFUSED|verify a lost buy|No (demo|real) account/.test(msg)) { haltBot(bot, msg); break; }
      netErrs++; bot.msg = `Network problem (${netErrs}/6): ${msg}`; render();
      if (netErrs >= 6) { haltBot(bot, 'Connection lost — stopped'); break; }
      await sleepWhile(bot, Math.min(2000 * netErrs, 12000));
    }
  }
  bot.running = false; render();
}
async function sleepWhile(bot, ms) { const end = Date.now() + ms; while (bot.running && Date.now() < end) await sleep(Math.min(500, end - Date.now())); }
function haltBot(bot, reason) { bot.running = false; bot.status = 'halted'; bot.msg = 'Stopped: ' + reason; bot.haltReason = reason; render(); toast(`Rise/Fall stopped: ${reason}`); }

async function startBot() {
  if (RON()) { const r = RM(); if (!r.st) { setFormErr('Still connecting to your server…'); return; }
    const errs = E.validateParams(r.draft || {}); if (errs.length) { setFormErr(errs.join(' · ')); return; }
    setFormErr(''); try { await r.start(); toast('Rise/Fall bot started on your server (demo)'); } catch (e) { setFormErr(errText(e)); } return; }
  const bot = BOT; if (bot.running) return;
  if (bot.open) { toast('Wait for the last contract to settle first'); return; }
  const s = DA.snapshot();
  if (!s.connected) { setFormErr('Connect your Deriv account first (top right)'); return; }
  const mode = s.mode; if (!(mode === 'demo' ? s.hasDemo : s.hasReal)) { setFormErr(`No ${mode} account on this token`); return; }
  const p = Object.assign({}, PARAMS[KEY]);
  const errs = E.validateParams(p); if (errs.length) { setFormErr(errs.join(' · ')); return; }
  const g = globalCheck(mode, +p.stake); if (g) { setFormErr(g + '. Raise the ATS limits on the dashboard to continue.'); return; }
  setFormErr(''); bot.msg = 'Asking Deriv to price the contract…'; render();
  try { await preflight(p, mode); } catch (e) { bot.msg = 'Idle'; setFormErr(errText(e)); render(); return; }
  if (mode === 'real') {
    const ok = confirm(`REAL MONEY\n\nStart the Rise/Fall bot on your REAL account?\n\nStake $${(+p.stake).toFixed(2)}${p.martingale ? `, martingale ×${p.mg_factor} up to ${p.mg_max_steps} steps (cap $${(+p.max_stake).toFixed(2)})` : ''}, ${E.cycleLabel(p)} cycle.\nIt stops at a $${(+p.session_sl).toFixed(2)} loss or $${(+p.session_tp).toFixed(2)} profit.\n\nThe analysis has NO proven edge. You can lose this money.`);
    if (!ok) { bot.msg = 'Idle'; render(); return; }
  }
  bot.run = new E.BotRun(p); bot.mode = mode; bot.running = true; bot.status = 'running'; bot.haltReason = null; bot.alt = null; bot.startedAt = now(); bot.msg = 'Starting…'; render();
  botLoop(bot);
}
function stopBot(why) { if (RON()) { RM().stop().then(() => toast('Server bot stopping'), rErr); return; } const bot = BOT; if (!bot.running && !bot.open) return; bot.running = false; bot.status = 'stopped';
  bot.msg = bot.open ? `Stopping — waiting for #${bot.open.contract_id} to settle` : 'Stopped' + (why ? ': ' + why : ''); render(); }
function stopAll(why) { if (RON()) { RM().stopAll().then(() => toast('Stop all sent to the server'), rErr); return; } const was = anyRunning(); stopBot(why); if (why) toast('Bot stopped: ' + why); else if (was) toast('Rise/Fall bot stopped'); render(); }

// Orphaned open contracts (page reloaded mid-trade): settle them from the account.
async function reconcileOrphans() {
  if (RON()) return;
  const orphans = HIST.filter(h => h.status === 'open' && !(BOT.open && BOT.open.contract_id === h.contract_id));
  for (const h of orphans) {
    if (!DA.state.accounts[h.mode]) continue;
    try { const d = await conn(h.mode).send({ proposal_open_contract: 1, contract_id: h.contract_id }); const p = d.proposal_open_contract;
      if (p && +p.is_sold === 1) recordSettle(h, { profit: +p.profit, exit_spot: p.exit_spot });
    } catch (e) { if (isApiError(e)) { h.status = 'unknown'; saveHist(); } }
  }
  render();
}

/* ---------------- UI ---------------- */
const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17V7M4 10l3-3 3 3M17 7v10M14 14l3 3 3-3"/></svg>';
function accountName() {
  const custom = localStorage.getItem(LS.name); if (custom) return custom;
  for (const m of ['real', 'demo']) { const a = DA.state.accounts[m]; const n = a && (a.fullname || a.full_name || a.name || [a.first_name, a.last_name].filter(Boolean).join(' ')); if (n) return n; }
  return 'Trader';
}
const botState = b => (b.running || b.open) ? (b.running ? 'Running' : 'Stopping') : b.status === 'halted' ? 'Halted' : 'Idle';
function render() { if (!$('tab-ats')) return; const srv = RSRV();
  $('atsFineServer').hidden = !srv; $('atsFineLocal').hidden = srv; $('atsNewSession').style.display = srv ? '' : 'none'; $('atsHistMode').style.display = srv ? 'none' : '';
  renderDash(); if (view === 'bots') renderBots(); else renderHistory(); if (openBot) renderBotLive(); }
function renderDashRemote() {
  const r = RM(), st = r.st;
  $('atsName').textContent = accountName(); $('atsReal').hidden = true;
  const badge = $('atsMode'); badge.className = 'ats-mode ' + (st ? 'server' : 'off'); badge.innerHTML = st ? '● DEMO · SERVER' : r.err || !r.hasKey() ? 'OFFLINE' : 'CONNECTING';
  if (!st) { $('atsPnl').textContent = '$0.00'; $('atsPnl').className = 'ats-big'; $('atsSince').textContent = ''; $('atsBal').textContent = '—';
    $('atsTrades').textContent = '0'; $('atsWin').textContent = '—'; $('atsOpen').textContent = '0';
    $('atsStatus').innerHTML = `<i class="pulse off"></i><span>${!r.hasKey() ? 'Tap <b>Connect</b> (top right) and paste your server key once' : r.err ? 'Server: ' + esc(r.err) : 'Connecting to your server…'}</span>`;
    $('atsStopAll').disabled = true; $('atsLimits').textContent = 'ATS limits: loading…'; return; }
  const se = st.session, b = st.bot, live = b.live && b.open ? +b.live.profit || 0 : 0;
  const el = $('atsPnl'); el.textContent = money(se.pnl, true); el.className = 'ats-big ' + (se.pnl > 0 ? 'up' : se.pnl < 0 ? 'dn' : '');
  $('atsSince').textContent = `since ${bhStamp(se.start)} Bahrain` + (live ? ` · open ${money(live, true)}` : '');
  const bal = st.account && st.account.balance; $('atsBal').textContent = bal == null ? '—' : '$' + Number(bal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $('atsTrades').textContent = se.trades; $('atsWin').textContent = pct(se.winrate); $('atsOpen').textContent = se.open;
  const on = b.running || b.open, la = st.last_analysis;
  const stake = on && b.next_stake != null ? `Next stake $${(+b.next_stake).toFixed(2)}${b.step ? ' · martingale step ' + b.step : ' · base stake'}` : '';
  const an = la ? `Last analysis: ${la.dir ? (la.dir === 'up' ? 'Rise' : 'Fall') + ' ' + la.conf + '%' : 'neutral'} on ${esc(la.tf)} candles · ${bhTime(la.at)}` : '';
  const ago = Math.round((Date.now() - r.lastOk) / 1000);
  const line = r.err ? `<div class="srv-line err"><i class="dot"></i>Server unreachable: ${esc(r.err)}</div>` : `<div class="srv-line"><i class="dot"></i>Running on your server 24/7 · updated ${ago < 2 ? 'just now' : ago + 's ago'}</div>`;
  $('atsStatus').innerHTML = on ? `<i class="pulse"></i><span><b>Rise/Fall ${b.running ? 'running' : 'stopping'}</b> · V25 (1s) · ${esc(b.cycle)} · DEMO<br><small class="muted">${esc(b.msg || '')}</small>${stake ? `<br><small class="muted">${esc(stake)}</small>` : ''}${an ? `<br><small class="muted">${an}</small>` : ''}${line}</span>`
    : `<i class="pulse off"></i><span>${b.state === 'halted' ? 'Bot stopped: ' + esc(b.halt_reason || '') : 'No bot running on the server'}${an ? `<br><small class="muted">${an}</small>` : ''}${line}</span>`;
  $('atsStopAll').disabled = !on || r.busy;
  $('atsLimits').textContent = `ATS limits for this session: stop at −$${(+st.global.sl).toFixed(2)} or +$${(+st.global.tp).toFixed(2)}`;
}
function renderDash() {
  if (RSRV()) return renderDashRemote();
  const s = DA.snapshot(); const mode = s.mode;
  $('atsName').textContent = accountName();
  const badge = $('atsMode'); badge.className = 'ats-mode ' + (s.connected ? mode : 'off'); badge.innerHTML = s.connected ? (mode === 'real' ? '● REAL' : '● DEMO') : 'OFFLINE';
  $('atsReal').hidden = true; // the header REAL banner is shown instead (one banner only)
  const st = E.statsOf(sessionRows(mode));
  const live = BOT.mode === mode && BOT.live ? +BOT.live.profit || 0 : 0;
  const el = $('atsPnl'); el.textContent = money(st.pnl, true); el.className = 'ats-big ' + (st.pnl > 0 ? 'up' : st.pnl < 0 ? 'dn' : '');
  $('atsSince').textContent = `since ${bhTime(SESSION.start)} Bahrain` + (live ? ` · open ${money(live, true)}` : '');
  $('atsBal').textContent = s.balance == null ? '—' : '$' + Number(s.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $('atsTrades').textContent = st.trades; $('atsWin').textContent = pct(st.winrate); $('atsOpen').textContent = st.open;
  const on = anyRunning(); const p = BOT.run ? BOT.run.p : PARAMS[KEY];
  $('atsStatus').innerHTML = on ? `<i class="pulse"></i><span><b>Rise/Fall ${BOT.running ? 'running' : 'stopping'}</b> · V25 (1s) · ${esc(E.cycleLabel(p))}${BOT.mode === 'real' ? ' (REAL)' : ''}<br><small class="muted">${esc(BOT.msg || '')}</small></span>`
    : `<i class="pulse off"></i><span>${s.connected ? (BOT.status === 'halted' ? 'Bot stopped: ' + esc(BOT.haltReason || '') : 'No bot running') : 'Connect your Deriv account to start the bot'}</span>`;
  $('atsStopAll').disabled = !on;
  $('atsLimits').textContent = `ATS limits for this session: stop at −$${(+GLOBAL.sl).toFixed(2)} or +$${(+GLOBAL.tp).toFixed(2)}`;
}
function renderBots() {
  let st, p, on, state;
  if (RON()) { const r = RM(), x = r.st; p = r.draft || (x && x.bot.params) || PARAMS[KEY]; st = x ? x.session : { trades: 0, pnl: 0 };
    on = !!(x && (x.bot.running || x.bot.open)); state = !x ? 'Idle' : { running: 'Running', stopping: 'Stopping', halted: 'Halted' }[x.bot.state] || 'Idle'; }
  else { const s = DA.snapshot(), b = BOT; st = E.statsOf(rfRows(sessionRows(s.mode))); p = PARAMS[KEY]; on = b.running || b.open; state = botState(b); }
  const dir = { analysis: 'Analysis', up: 'Always Rise', down: 'Always Fall', alternate: 'Alternate' }[p.direction];
  $('atsBots').innerHTML = `<button type="button" class="bot-card wide rf${on ? ' on' : ''}" data-bot="${KEY}"><span class="bot-icon">${ICON}</span><span class="bot-state ${state.toLowerCase()}">${state}</span>
      <span class="bot-name">Rise / Fall · Volatility 25 (1s)</span><span class="bot-desc">${esc(T.desc)}</span>
      <span class="bot-foot"><span>${esc(E.cycleLabel(p))} cycle · ${dir} · $${(+p.stake).toFixed(2)}${p.martingale ? ` · MG ×${p.mg_factor}` : ''}</span><b class="${st.pnl > 0 ? 'up' : st.pnl < 0 ? 'dn' : ''}">${st.trades ? money(st.pnl, true) : 'Open settings ›'}</b></span></button>`;
  $('atsBots').querySelectorAll('.bot-card').forEach(el => el.onclick = () => openBotView(KEY));
}
function histRows() { if (RON()) { const h = RM().hist; return h ? rfRows(h.rows) : []; } const m = histMode === 'current' ? DA.state.mode : histMode; return rfRows(HIST).filter(h => histMode === 'all' || h.mode === m); }
function renderHistory() {
  const rows = histRows(); const a = E.statsOf(rows);
  $('atsHistMode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === histMode));
  $('atsHistAll').innerHTML = `<div><span class="eyebrow">Trades</span><b>${a.trades}</b></div><div><span class="eyebrow">Win rate</span><b>${pct(a.winrate)}</b></div><div><span class="eyebrow">P&amp;L</span><b class="${a.pnl > 0 ? 'up' : a.pnl < 0 ? 'dn' : ''}">${money(a.pnl, true)}</b></div>`;
  const sid = RON() ? (RM().st ? RM().st.session.id : null) : SESSION.id;
  const groups = [['Rise (CALL)', rows.filter(h => h.contract_type === 'CALL')], ['Fall (PUT)', rows.filter(h => h.contract_type === 'PUT')], ['This session', rows.filter(h => h.session === sid)]];
  $('atsHistBots').innerHTML = groups.map(([n, r]) => { const s = E.statsOf(r);
    return `<div class="srow"><div>${esc(n)}<div class="n">${s.trades} trade${s.trades === 1 ? "" : "s"} · ${s.wins}–${s.losses}${s.open ? ' · ' + s.open + ' open' : ''}</div></div><span class="tag">${pct(s.winrate)}</span><b class="${s.pnl > 0 ? 'win' : s.pnl < 0 ? 'loss' : ''}">${money(s.pnl, true)}</b></div>`; }).join('');
  const list = rows.slice().reverse().slice(0, 150);
  $('atsHistList').innerHTML = list.length ? list.map(h => `<li><div><b>${esc(sideName(h.contract_type))}</b> · V25 (1s) · ${esc(h.cycle || h.duration || '')}${h.mode === 'real' ? ' <span class="real-tag">REAL</span>' : ''}${h.recovered ? ' <span class="real-tag">RECOVERED</span>' : ''}
      <small>${bhStamp(h.t)} · #${esc(h.contract_id)} · stake $${(+h.stake).toFixed(2)}${h.step ? ' · MG step ' + h.step : ''}</small></div>
      <b class="${h.status === 'settled' ? (h.profit > 0 ? 'up' : 'dn') : 'muted'}">${h.status === 'settled' ? (h.profit > 0 ? 'Won ' : 'Lost ') + money(h.profit, true) : h.status === 'open' ? 'Open' : esc(h.status)}</b></li>`).join('')
    : (RON() && !RM().hist ? '<li class="muted sm">Loading history from your server…</li>' : '<li class="muted sm">No trades yet. Start the Rise/Fall bot from the Bots tab.</li>');
}
function setView(v) { view = v; $('atsSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); $('atsBots').hidden = v !== 'bots'; $('atsHistory').hidden = v !== 'history'; render(); }

/* ---- bot settings view ---- */
const F = (label, inner, hint) => `<label class="field">${label}${inner}${hint ? `<small class="hint">${hint}</small>` : ''}</label>`;
const numIn = (k, v, step, min) => `<input data-k="${k}" type="number" inputmode="decimal" step="${step}" ${min != null ? `min="${min}"` : ''} value="${esc(v)}">`;
const sel = (k, v, opts) => `<select data-k="${k}">${opts.map(([val, lab]) => `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
const tog = (k, v, label) => `<label class="tog"><input data-k="${k}" type="checkbox"${v ? ' checked' : ''}><span class="tog-ui"></span><span>${label}</span></label>`;
const DIR_OPTS = [['analysis', 'Our analysis (waits when neutral)'], ['up', 'Always Rise'], ['down', 'Always Fall'], ['alternate', 'Alternate Rise / Fall']];
function openBotView() { openBot = KEY; $('atsMain').hidden = true; $('atsBotView').hidden = false; renderBotView(); window.scrollTo({ top: 0 }); }
function closeBotView() { openBot = null; $('atsMain').hidden = false; $('atsBotView').hidden = true; render(); }
function cycleHint(p) {
  if (p.cycle === 'ticks') return `Each contract lasts ${p.ticks} tick${+p.ticks === 1 ? '' : 's'} (≈${p.ticks}s). Analysis reads 1m candles.`;
  const sec = E.cycleSec(p); if (!sec) return '';
  const tf = E.analysisTFs(sec); const d = E.cycleDuration(p);
  return `Contract: ${d.duration}${d.duration_unit === 'h' ? 'h' : 'm'}${p.align ? ', opening at each candle and closing at the next' : ''}. Analysis reads ${E.gLabel(tf['1h'])} candles, with ${E.gLabel(tf['4h'])} and ${E.gLabel(tf['1d'])} as higher timeframes.`;
}
function renderBotView() {
  if (RON() && !RM().draft) { $('atsBotView').innerHTML = `<div class="bv-head"><button type="button" class="icon-btn" id="bvBack" aria-label="Back"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button><div class="bv-title"><h2>Rise / Fall bot</h2><div class="muted sm">Loading settings from your server…</div></div></div>`;
    $('bvBack').onclick = closeBotView; RM().refresh().then(() => { if (openBot && RM().draft) renderBotView(); }); return; }
  const p = RON() ? RM().draft : PARAMS[KEY];
  const lad = E.stakeLadder(p);
  const ladder = lad.map(x => `<span class="${x.over ? 'over' : ''}" title="raw $${x.raw}">$${x.stake.toFixed(2)}</span>`).join('<i>→</i>');
  const okRows = lad.filter(x => !x.over); const worst = okRows.length ? okRows[okRows.length - 1].cum : +p.stake;
  const isTicks = p.cycle === 'ticks', isCustom = p.cycle === 'custom';
  $('atsBotView').innerHTML = `
    <div class="bv-head"><button type="button" class="icon-btn" id="bvBack" aria-label="Back"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
      <span class="bot-icon sm rf">${ICON}</span><div class="bv-title"><h2>Rise / Fall bot</h2><div class="muted sm">Volatility 25 (1s) Index · ${SYM}</div></div></div>
    <div class="card bv-live" id="bvLive"></div>
    <form id="bvForm" autocomplete="off">
      <div class="card"><div class="bv-sec">Trade</div>
        ${F('Direction', sel('direction', p.direction, DIR_OPTS), p.direction === 'analysis' ? 'Uses the V25 analysis on the cycle’s candles. No proven edge yet.' : '')}
        <div class="grid2">${F('Stake $', numIn('stake', p.stake, 0.01, E.MIN_STAKE), 'Min $0.35')}${F('Cycle', sel('cycle', p.cycle, E.CYCLE_OPTS))}</div>
        ${isCustom ? `<div class="field">Custom cycle<div class="dur">${numIn('custom_n', p.custom_n, 1, 1)}${sel('custom_u', p.custom_u, [['m', 'Minutes'], ['h', 'Hours']])}</div></div>` : ''}
        ${isTicks ? F('Ticks', sel('ticks', p.ticks, [...Array(10)].map((_, i) => [i + 1, (i + 1) + ' tick' + (i ? 's' : '')]))) : tog('align', p.align, 'Align to candle boundary')}
        <small class="hint">${esc(cycleHint(p))}</small></div>
      <div class="card"><div class="row-between"><div class="bv-sec" style="margin:0">Martingale recovery</div>${tog('martingale', p.martingale, '')}</div>
        <div class="${p.martingale ? '' : 'dim'}"><div class="grid2" style="margin-top:12px">${F('Multiply stake by', numIn('mg_factor', p.mg_factor, 0.1, 1.01))}${F('Max steps', numIn('mg_max_steps', p.mg_max_steps, 1, 1))}</div>
        ${tog('mg_reset_win', p.mg_reset_win, 'Reset to base stake after a win')}
        ${p.martingale ? `<div class="ladder">${ladder}</div><small class="hint">Stakes are rounded to cents. After a loss the stake is multiplied. When the max steps are used up, or the next stake would pass your cap, the bot <b>stops</b>.</small>` : ''}</div></div>
      <div class="card"><div class="bv-sec">Risk limits <span class="req">required</span></div>
        <div class="grid2">${F('Session stop-loss $', numIn('session_sl', p.session_sl, 0.5, 0.01))}${F('Take-profit $', numIn('session_tp', p.session_tp, 0.5, 0.01))}${F('Max losses in a row', numIn('max_consec_losses', p.max_consec_losses, 1, 1))}${F('Max stake cap $', numIn('max_stake', p.max_stake, 0.5, E.MIN_STAKE))}</div>
        <small class="hint">The bot stops <b>before</b> any trade that could break a limit. Worst losing run: about $${worst.toFixed(2)}.</small></div>
      <p class="fine warn-text" id="bvErr" hidden></p>
    </form>
    <div class="bv-trades card"><div class="bv-sec">This session's trades</div><ul class="trades" id="bvTrades"></ul></div>
    <div class="bv-actions"><button type="button" class="btn primary block" id="bvStart">Start bot</button></div>`;
  $('bvBack').onclick = closeBotView;
  const form = $('bvForm');
  form.querySelectorAll('[data-k]').forEach(el => el.onchange = () => {
    const k = el.dataset.k; let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number' || k === 'ticks') v = +v;
    if (RON()) { const r = RM(); r.draft[k] = v; renderBotView(); r.pushDraft().then(err => setFormErr(err ? 'Not saved on the server yet: ' + err : '')); return; }
    PARAMS[KEY][k] = v; saveParams(); setFormErr(''); renderBotView();
  });
  form.onsubmit = e => e.preventDefault();
  $('bvStart').onclick = () => { if (RON()) { const x = RM().st; if (x && (x.bot.running || x.bot.open)) stopBot(); else startBot(); return; } if (BOT.running || BOT.open) stopBot(); else startBot(); };
  renderBotLive();
}
function setFormErr(msg) { const el = $('bvErr'); if (!el || !openBot) { if (msg) toast(msg); return; } el.hidden = !msg; el.textContent = msg || ''; }
function renderBotLiveRemote() {
  const r = RM(), x = r.st; if (!x) return; const b = x.bot, on = b.running || b.open;
  const rows = r.hist ? rfRows(r.hist.rows).filter(h => h.session === x.session.id) : [];
  const st = x.session; const state = { running: 'Running', stopping: 'Stopping', halted: 'Halted' }[b.state] || 'Idle';
  $('bvLive').innerHTML = `<div class="row-between"><span class="bot-state ${state.toLowerCase()}">${state} · SERVER · DEMO</span><b class="${st.pnl > 0 ? 'up' : st.pnl < 0 ? 'dn' : ''}">${money(st.pnl, true)}</b></div>
    <div class="bv-msg">${esc(b.state === 'halted' ? 'Stopped: ' + (b.halt_reason || '') : b.msg || 'Idle')}</div>
    <div class="stats3"><div><span class="eyebrow">Trades</span><b>${st.trades}</b></div><div><span class="eyebrow">Won–lost</span><b>${st.wins}–${st.losses}</b></div><div><span class="eyebrow">${on ? 'Next stake' : 'Win rate'}</span><b>${on ? (b.next_stake != null ? '$' + (+b.next_stake).toFixed(2) + (b.step ? ` · s${b.step}` : '') : '—') : pct(st.winrate)}</b></div></div>`;
  const btn = $('bvStart'); btn.textContent = on ? (b.running ? 'Stop bot' : 'Stopping…') : r.busy ? 'Starting…' : 'Start bot on server (Demo)';
  btn.className = 'btn block ' + (on ? 'stop' : 'primary'); btn.disabled = !!(on && !b.running) || r.busy;
  $('bvForm').querySelectorAll('input,select').forEach(el => el.disabled = !!on);
  $('bvTrades').innerHTML = rows.slice().reverse().slice(0, 12).map(h => `<li><div>${esc(sideName(h.contract_type))} · $${(+h.stake).toFixed(2)}<small>${bhStamp(h.t)} · #${esc(h.contract_id)}${h.step ? ' · step ' + h.step : ''}</small></div><b class="${h.status === 'settled' ? (h.profit > 0 ? 'up' : 'dn') : 'muted'}">${h.status === 'settled' ? money(h.profit, true) : esc(h.status)}</b></li>`).join('') || '<li class="muted sm">No trades this session.</li>';
}
function renderBotLive() {
  if (!openBot || !$('bvLive')) return; if (RON()) return renderBotLiveRemote(); const b = BOT;
  const on = b.running || b.open; const r = b.run && b.run.snapshot();
  const rows = rfRows(HIST).filter(h => h.session === SESSION.id);
  const st = E.statsOf(rows); const state = botState(b);
  $('bvLive').innerHTML = `<div class="row-between"><span class="bot-state ${state.toLowerCase()}">${state}${b.mode ? ' · ' + b.mode.toUpperCase() : ''}</span><b class="${st.pnl > 0 ? 'up' : st.pnl < 0 ? 'dn' : ''}">${money(st.pnl, true)}</b></div>
    <div class="bv-msg">${esc(b.msg || 'Idle')}</div>
    <div class="stats3"><div><span class="eyebrow">Trades</span><b>${st.trades}</b></div><div><span class="eyebrow">Won–lost</span><b>${st.wins}–${st.losses}</b></div><div><span class="eyebrow">${r && on ? 'Next stake' : 'Win rate'}</span><b>${r && on ? (r.nextStake != null ? '$' + r.nextStake.toFixed(2) + (r.step ? ` · s${r.step}` : '') : '—') : pct(st.winrate)}</b></div></div>`;
  const btn = $('bvStart'); btn.textContent = on ? (b.running ? 'Stop bot' : 'Stopping…') : (DA.state.mode === 'real' ? 'Start bot on REAL' : 'Start bot on Demo');
  btn.className = 'btn block ' + (on ? 'stop' : DA.state.mode === 'real' ? 'realgo' : 'primary'); btn.disabled = !!(on && !b.running);
  $('bvForm').querySelectorAll('input,select').forEach(el => el.disabled = !!on);
  $('bvTrades').innerHTML = rows.slice().reverse().slice(0, 12).map(h => `<li><div>${esc(sideName(h.contract_type))} · $${(+h.stake).toFixed(2)}<small>${bhStamp(h.t)} · #${esc(h.contract_id)}${h.step ? ' · step ' + h.step : ''}</small></div><b class="${h.status === 'settled' ? (h.profit > 0 ? 'up' : 'dn') : 'muted'}">${h.status === 'settled' ? money(h.profit, true) : esc(h.status)}</b></li>`).join('') || '<li class="muted sm">No trades this session.</li>';
}

/* ---- wiring ---- */
function init() {
  if (!$('tab-ats')) return;
  document.querySelectorAll('.app-menu .bot-icon.sm.rf').forEach(el => { el.innerHTML = ICON; });
  $('atsSeg').querySelectorAll('button').forEach(b => b.onclick = () => setView(b.dataset.v));
  $('atsHistMode').querySelectorAll('button').forEach(b => b.onclick = () => { histMode = b.dataset.m; renderHistory(); });
  $('atsStopAll').onclick = () => stopAll();
  $('atsNameEdit').onclick = () => { const n = prompt('Your name for the ATS welcome (stored only on this phone). The new Deriv API does not share your account name.', accountName() === 'Trader' ? '' : accountName()); if (n != null) { n.trim() ? localStorage.setItem(LS.name, n.trim().slice(0, 40)) : localStorage.removeItem(LS.name); render(); } };
  $('atsNewSession').onclick = () => { const x = RM() && RM().st; if (x && (x.bot.running || x.bot.open)) { toast('Stop the bot first'); return; }
    if (confirm('Start a new session on the server? Session P&L and the ATS limits count from $0 again. History is kept.')) RM().newSession().then(() => toast('New session started'), rErr); };
  $('atsLimitsEdit').onclick = () => { if (RON()) { const g = RM().st && RM().st.global; if (!g) return; const sl = prompt('Server bot: stop when this session loses ($):', g.sl); if (sl == null) return; const tp = prompt('Server bot: stop when this session earns ($):', g.tp); if (tp == null) return;
      if (+sl > 0 && +tp > 0) RM().saveGlobal({ sl: +sl, tp: +tp }).then(() => toast('Limits saved on the server'), rErr); else toast('Both limits must be above $0'); return; }
    const sl = prompt('Stop the bot when this session loses ($):', GLOBAL.sl); if (sl == null) return; const tp = prompt('Stop the bot when this session earns ($):', GLOBAL.tp); if (tp == null) return;
    if (+sl > 0 && +tp > 0) { GLOBAL.sl = +sl; GLOBAL.tp = +tp; save(LS.global, GLOBAL); render(); } else toast('Both limits must be above $0'); };
  $('atsExport').onclick = () => { const cols = ['t', 'mode', 'symbol', 'contract_type', 'contract_id', 'stake', 'cycle', 'duration', 'step', 'status', 'result', 'profit', 'entry_spot', 'exit_spot', 'why'];
    const csv = [cols.join(',')].concat(histRows().map(h => cols.map(c => c === 't' ? C.fmtBahrain(h.t) : JSON.stringify(h[c] == null ? '' : h[c])).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `ats-risefall-history-${Date.now()}.csv`; a.click(); };
  $('atsClear').onclick = () => { if (RON()) { toast('Server history is kept on the server (export CSV to save a copy)'); return; } if (anyRunning()) { toast('Stop the bot first'); return; } if (confirm('Delete the ATS trade history on this phone? Export first if you need it.')) { HIST = HIST.filter(h => h.status === 'open'); saveHist(); render(); } };
  setInterval(() => {
    // safety: a mode switch stops the bot that was started on the other account
    if (!RON() && BOT.running && BOT.mode !== DA.state.mode) haltBot(BOT, `Account switched to ${DA.state.mode.toUpperCase()} — stopped`);
    if ($('tab-ats').classList.contains('active')) render();
  }, 1000);
  setInterval(() => { if (HIST.some(h => h.status === 'open') && DA.snapshot().connected) reconcileOrphans(); }, 30e3);
  setTimeout(() => { if (DA.snapshot().connected) reconcileOrphans(); }, 2500);
  window.addEventListener('beforeunload', e => { if (anyRunning()) { e.preventDefault(); e.returnValue = 'Bot is running'; } });
  render();
}
window.ATS = { BOTS, PARAMS, HIST: () => HIST, startBot, stopBot, stopAll, render, setView, openBotView, closeBotView, session: SESSION, conn, analysisDirection };
init();
})();
