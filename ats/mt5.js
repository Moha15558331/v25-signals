/* ATS MT5 tab: dashboard, loss recovery and live-editable inputs for ATS_V25 (Deriv-Demo).
 * Data: GET /api/mt5. Controls: POST /api/mt5/control, /close, /settings, /day/reset, /history/clear. DEMO ONLY.
 * The form is built once (window.ATSForm) and only patched while not focused or edited, so polling never closes the keyboard. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const A = () => window.ATSApp, R = () => window.ATSRemote;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (x, sign) => x == null || isNaN(x) ? '—' : (sign && x > 0 ? '+' : x < 0 ? '−' : '') + '$' + Math.abs(+x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cls = x => x > 0 ? 'up' : x < 0 ? 'dn' : '';
const tm = ep => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bahrain', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ep * 1000));
const dur = s => s < 60 ? Math.max(1, Math.round(s)) + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.floor(s / 3600) + 'h ' + Math.round(s % 3600 / 60) + 'm';
const UP = '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>', DN = '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
const STATE = { in_trade: ['In a trade', 'live'], watching: ['Watching', 'live'], pause: ['Between sessions', 'warn'], locked: ['Day locked', 'ok'], stopped: ['Day stopped', 'bad'],
  halted: ['Halted', 'bad'], off: ['Stopped', ''], algo_off: ['Algo off', 'bad'], connecting: ['Connecting', 'warn'], refused: ['Refused', 'bad'], starting: ['Starting', 'warn'] };
const f = (k, label, type, unit, hint, show) => ({ k, label, type, unit, hint, show });
const recOn = d => !!d.rec_on, sesOn = d => !!d.sessions_on;
const SCHEMA = [
  { title: 'Trade', fields: [f('symbol', 'Symbol', 's'), f('lots', 'Lot size', 'n'), f('tp_usd', 'Take profit', 'n', '$'), f('sl_usd', 'Stop loss', 'n', '$'), f('reverse', 'Reverse signals', 'b', '', 'Buy on a sell signal and sell on a buy'), f('max_minutes', 'Max trade time', 'i', 'min', '0 = off'), f('deviation', 'Max slippage', 'i', 'pts')] },
  { title: 'Loss recovery', fields: [f('rec_on', 'Recovery', 'b', '', 'Raise the lot after a loss until it is won back'), f('rec_factor', 'Factor', 'n', '×', 'Lot × factor per step', recOn), f('rec_steps', 'Max steps', 'i', '', '', recOn), f('rec_max_lot', 'Max lot', 'n', '', '', recOn), f('rec_reset_win', 'Reset on any win', 'b', '', 'Off: reset once the loss is won back', recOn)] },
  { title: 'Signal', fields: [f('conf', 'Agreement', 'i', '%'), f('min_score', 'Min score', 'n'), f('check_sec', 'Check every', 'i', 's')] },
  { title: 'Sessions', fields: [f('sessions_on', 'Sessions', 'b'), f('sessions', 'Sessions per day', 'i', '', '', sesOn), f('ses_tp', 'Session target', 'n', '$', '', sesOn), f('ses_sl', 'Session stop', 'n', '$', '', sesOn), f('ses_pause', 'Pause between', 'i', 's', '', sesOn)] },
  { title: 'Daily limits', fields: [f('day_tp', 'Daily lock', 'n', '$'), f('day_sl', 'Daily stop', 'n', '$'), f('max_losses', 'Loss-streak halt', 'i'), f('smart_cap', 'Cut SL to room left', 'b')] },
  { title: 'EA', fields: [f('magic', 'Magic number', 'i'), f('tz_offset', 'Day-reset offset', 'i', 's')] },
];
const M = { d: null, err: null, at: 0, busy: false, tab: false, home: true, t: null, form: null, built: false, last: {} };
async function load() { const r = R(); if (!r || !r.hasKey()) { M.err = 'Connect your server on Home first'; return; }
  try { M.d = await r.api('GET', '/api/mt5'); M.err = null; M.at = Date.now(); } catch (e) { M.err = e.message; } }
function after() { if (M.tab) render(); else if (A()) A().renderHome(); }
function loop() { clearTimeout(M.t); if (!M.tab && !M.home) return;
  (async () => { if (!document.hidden) { await load(); after(); } const pos = M.d && M.d.ea && M.d.ea.position; M.t = setTimeout(loop, M.tab ? (pos ? 2000 : 4000) : 8000); })(); }
function show(tab, home) { const was = M.tab || M.home; M.tab = !!tab; M.home = !!home; if (M.tab) render(); if (M.tab || M.home) { if (!was || M.tab) loop(); } else clearTimeout(M.t); }
async function act(path, body, okMsg) { const r = R(); M.busy = true; after();
  try { M.d = await r.api('POST', path, body); if (okMsg) A().toast({ level: 'win', title: okMsg }); } catch (e) { A().toast({ level: 'error', title: e.message }); }
  M.busy = false; await load(); after(); }
async function toggle() { const running = M.d && M.d.control === 'run';
  if (running) { if (await A().ask({ title: 'Stop the MT5 bot?', text: 'It stops opening new trades. An open trade keeps its stop loss and take profit.', ok: 'Stop', danger: true })) await act('/api/mt5/control', { state: 'stop' }, 'MT5 bot stopped'); }
  else await act('/api/mt5/control', { state: 'run' }, 'MT5 bot started'); }
const stop = () => act('/api/mt5/control', { state: 'stop' }, null);
async function closeNow() { if (await A().ask({ title: 'Close the MT5 trade now?', text: 'It closes at the current price, win or lose.', ok: 'Close now', danger: true })) act('/api/mt5/close', {}, 'Close sent'); }
const isDemo = () => { const a = M.d && M.d.ea && M.d.ea.account; return !!(a && a.demo); };
async function resetToday() { if (!isDemo()) { A().toast({ level: 'error', title: 'Reset is only available on demo' }); return; }
  if (await A().ask({ title: 'Reset today?', text: 'Today’s P/L, sessions, recovery step and lock/stop flags start over. History is kept. The Deriv statement is not changed.', ok: 'Reset' })) act('/api/mt5/day/reset', {}, 'Today reset'); }
async function clearHist() { if (!isDemo()) { A().toast({ level: 'error', title: 'Clear history is only available on demo' }); return; }
  const run = M.d && M.d.control === 'run', open = M.d && M.d.ea && M.d.ea.position;
  if (run || open) { A().toast({ level: 'error', title: open ? 'Close or wait for the open trade first' : 'Stop the MT5 bot first' }); return; }
  if (await A().ask({ title: 'Clear history?', text: 'MT5 trades disappear from this app and today’s P/L is reset. The Deriv statement is not changed.', ok: 'Clear', danger: true })) act('/api/mt5/history/clear', {}, 'History cleared'); }
async function save() { const fm = M.form; if (!fm) return;
  if (Object.values(fm.changes()).some(v => v === '' || (typeof v === 'number' && isNaN(v)))) { A().toast({ level: 'error', title: 'Fill in every field' }); return; }
  M.busy = true; $('m5SaveBtn').disabled = true;
  try { M.d = await R().api('POST', '/api/mt5/settings', Object.assign({}, fm.draft)); fm.saved((M.d.ea && M.d.ea.settings) || fm.draft); $('m5Save').hidden = true;
    A().toast({ level: 'win', title: 'MT5 settings saved', text: 'The EA applies them live' });
    const err = M.d && M.d.ea && M.d.ea.last_order && M.d.ea.last_order.error; if (err) A().toast({ level: 'error', title: 'Broker / EA', text: err }); }
  catch (e) { A().toast({ level: 'error', title: e.message }); }
  M.busy = false; $('m5SaveBtn').disabled = false; await load(); render(); }
function chip(d) { const e = d.ea || {}; return !d.running ? (d.service !== 'active' ? ['Terminal down', 'bad'] : !d.fresh ? ['No heartbeat', 'bad'] : STATE[e.state] || [e.state, '']) : d.control !== 'run' && e.state !== 'in_trade' ? ['Stopped', ''] : STATE[e.state] || [e.state || '—', '']; }
function build(box) { box.innerHTML = `<div id="m5Err"></div><div class="mt5-grid"><div class="bot-col"><div id="m5Hero"></div><div id="m5Pos"></div><div id="m5Rec"></div><div id="m5Sig"></div><div id="m5Tr"></div></div>
  <div class="bot-col"><section class="card form-card"><div class="card-h"><h3>EA settings</h3><span class="muted" id="m5Acct"></span></div><form id="m5Form" autocomplete="off" onsubmit="return false"></form>
  <div class="save-row" id="m5Save" hidden><button type="button" class="btn ghost" id="m5Discard">Discard</button><button type="button" class="btn primary" id="m5SaveBtn">Save</button></div>
  <p class="muted small" id="m5Hint"></p><div class="row-btns"><button type="button" class="btn ghost sm" id="m5Reset">Reset today</button></div></section></div></div>`;
  $('m5Discard').onclick = () => { M.form.discard(); $('m5Save').hidden = true; }; $('m5SaveBtn').onclick = save; $('m5Reset').onclick = resetToday;
  box.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; if (b.id === 'mt5Toggle') toggle(); else if (b.id === 'mt5Close') closeNow(); else if (b.id === 'mt5ClearHist') clearHist(); else if (b.id === 'mt5ResetTop') resetToday(); });
  M.built = true; M.last = {}; }
function put(id, html) { if (M.last[id] !== html) { M.last[id] = html; $(id).innerHTML = html; } }
function render() { const box = $('mt5Body'); if (!box || !M.tab) return;
  if (!M.d) { M.built = false; box.innerHTML = `<div class="card"><p class="muted">${esc(M.err || 'Loading…')}</p></div>`; return; }
  if (!M.built || !$('m5Form')) build(box);
  const d = M.d, e = d.ea || {}, a = e.account || {}, s = e.symbol || {}, t = e.today || {}, ss = e.session || {}, p = e.position, g = e.signal || {}, set = e.settings || {}, rec = e.recovery || null;
  const [stTxt, stCls] = chip(d), run = d.control === 'run';
  const stop_ = +set.day_sl || 4, lock = +set.day_tp || 3.5, z = stop_ / (stop_ + lock) * 100, pn = +t.pnl || 0;
  const fw = pn >= 0 ? Math.min(1, pn / lock) * (100 - z) : Math.min(1, -pn / stop_) * z, fl = pn >= 0 ? z : z - fw;
  const lo = e.last_order || {};
  put('m5Err', (lo.error ? `<div class="notice bad" role="alert"><span>${esc(lo.error)}</span></div>` : '') + (M.err ? `<div class="notice bad"><span>${esc(M.err)}</span></div>` : ''));
  const dots = set.sessions_on ? `<div class="sdots">${Array.from({ length: ss.count || 0 }, (_, i) => { const lg = (ss.done || [])[i]; const c = lg ? (lg.pnl > 0 ? 'w' : 'l') : i + 1 === ss.n && t.day_state === 'trading' ? 'c' : ''; return `<i class="${c}"></i>`; }).join('')}<span>${(ss.done || []).length}/${ss.count || 0}</span></div>` : '';
  put('m5Hero', `<section class="card live-card"><div class="lv-top"><div><span class="eyebrow">Today</span><div class="big ${cls(t.pnl)}">${money(t.pnl || 0, true)}</div></div><div class="lv-r"><span class="chip ${stCls}">${esc(stTxt)}</span><small>${a.demo ? 'Demo' : '—'} · ${esc(a.login || '')}</small></div></div>
    <div class="dbar"><i class="z" style="left:${z}%"></i><i class="f ${pn >= 0 ? 'p' : 'n'}" style="left:${fl}%;width:${fw}%"></i></div><div class="dbar-l"><span>−$${stop_.toFixed(2)}</span><span>+$${lock.toFixed(2)}</span></div>
    <div class="kvs"><div><span class="eyebrow">Trades</span><b>${t.trades || 0}</b></div><div><span class="eyebrow">Win rate</span><b>${t.trades ? Math.round(t.wins / t.trades * 100) + '%' : '—'}</b></div><div><span class="eyebrow">${set.sessions_on ? `Session ${ss.n || 1}/${ss.count || '—'}` : 'Loss streak'}</span><b class="${set.sessions_on ? cls(ss.pnl) : ''}">${set.sessions_on ? money(ss.pnl, true) : (t.loss_streak || 0) + '/' + (set.max_losses || '—')}</b></div><div><span class="eyebrow">Equity</span><b>${a.equity != null ? '$' + Math.round(a.equity).toLocaleString('en-US') : '—'}</b></div></div>
    ${dots}<p class="lv-msg">${esc(e.reason || '')}</p>
    <button type="button" class="btn ${run ? 'ghost' : 'primary'} block" id="mt5Toggle"${M.busy || e.state === 'refused' ? ' disabled' : ''}>${run ? 'Stop MT5 bot' : 'Start MT5 bot'}</button></section>`);
  put('m5Pos', p ? `<section class="card"><div class="card-h"><h3>Open trade</h3><span class="chip ${p.dir === 'up' ? 'ok' : 'bad'}">${p.dir === 'up' ? 'Buy' : 'Sell'} ${esc(p.lots)} lot</span></div>
      <div class="big ${cls(p.profit)}">${money(p.profit, true)}</div><p class="muted small">${esc(p.comment || '')} · opened ${tm(p.opened)} · ${dur(Date.now() / 1000 - p.opened)}</p>
      <div class="kv"><span>Entry → now</span><b>${(+p.open).toFixed(2)} → ${(+p.price).toFixed(2)}</b></div><div class="kv"><span>Take profit / stop loss</span><b><span class="up">${money(p.tp_usd, true)}</span> / <span class="dn">${money(-p.sl_usd)}</span></b></div>
      <button type="button" class="btn danger block" id="mt5Close"${M.busy ? ' disabled' : ''}>Close now</button></section>` : '');
  put('m5Rec', !rec ? `<section class="card"><div class="card-h"><h3>Loss recovery</h3></div><p class="muted">The running EA does not report recovery yet.</p></section>` :
    `<section class="card rec-card${rec.on ? ' on' : ''}"><div class="card-h"><h3>Loss recovery</h3><span class="chip ${rec.on ? (rec.step ? 'warn' : 'live') : ''}">${rec.on ? (rec.step ? `Step ${rec.step}/${rec.steps}` : 'Armed') : 'Off'}</span></div>
      <div class="steps">${Array.from({ length: (rec.steps || 0) + 1 }, (_, i) => `<i class="${i < rec.step ? 'done' : i === rec.step ? 'cur' : ''}"><b>${i ? '×' + (Math.pow(rec.factor, i)).toFixed(i > 2 ? 1 : 2).replace(/\.?0+$/, '') : 'Base'}</b></i>`).join('')}</div>
      <div class="kvs"><div><span class="eyebrow">Next lot</span><b>${esc(rec.next_lots != null ? rec.next_lots : set.lots)}</b></div><div><span class="eyebrow">Chain P/L</span><b class="${cls(rec.chain_pnl)}">${money(rec.chain_pnl || 0, true)}</b></div><div><span class="eyebrow">Next TP / SL</span><b>${rec.next_tp_usd != null ? `${money(rec.next_tp_usd)} / ${money(rec.next_sl_usd)}` : '—'}</b></div><div><span class="eyebrow">Chains lost</span><b>${rec.busts || 0}</b></div></div>
      <p class="muted small">${rec.on ? `After a loss the lot grows ×${rec.factor} (max ${rec.steps} steps, max ${rec.max_lot} lot). It resets ${rec.reset_win ? 'on any win' : 'once the loss is won back'}, at the end of a session and at the daily stop.` : 'Turn it on in the settings below.'}</p></section>`);
  put('m5Sig', `<section class="card"><div class="card-h"><h3>Signal</h3><span class="muted">${g.t ? 'checked ' + tm(g.t) : ''}</span></div>${g.error != null ? `<p class="muted">${esc(g.error || 'Waiting for the first check')}</p>` :
    `<div class="sig"><span class="sig-dir ${g.lean === 'up' ? 'up' : g.lean === 'down' ? 'dn' : ''}">${g.lean === 'up' ? UP + 'Up' : g.lean === 'down' ? DN + 'Down' : 'Flat'}</span><b>${g.agree != null ? g.agree + '%' : '—'}</b><small>needs ${g.need}% · ${g.up} up / ${g.down} down${set.reverse ? ' · entries reversed' : ''}</small></div>
    <div class="tfs">${['m1', 'm5', 'm15', 'h1'].map(k => `<span class="${cls(g.tf && g.tf[k])}">${k.toUpperCase()}<b>${g.tf && g.tf[k] != null ? (g.tf[k] > 0 ? '+' : '') + (+g.tf[k]).toFixed(2) : '—'}</b></span>`).join('')}<span class="${cls(g.core)}">Core<b>${g.core != null ? (g.core > 0 ? '+' : '') + (+g.core).toFixed(2) : '—'}</b></span></div>`}</section>`);
  const tr = (e.trades || []).slice(0, 12).map(x => `<li><span class="t-ico ${x.dir === 'up' ? 'u' : 'd'}">${x.dir === 'up' ? UP : DN}</span><div class="t-main"><b>${x.dir === 'up' ? 'Buy' : 'Sell'} ${esc(x.lots)}${/\br[1-9]/.test(x.comment || '') ? `<span class="tag">${esc((x.comment.match(/\br([1-9]\d*)/) || [])[0])}</span>` : ''}</b><small>${tm(x.open_t)} · ${dur(x.close_t - x.open_t)}</small></div><div class="amt ${cls(x.profit)}">${money(x.profit, true)}</div></li>`).join('');
  put('m5Tr', `<section class="card"><div class="card-h"><h3>Recent trades</h3>${a.demo ? '<button type="button" class="link" id="mt5ClearHist">Clear</button>' : ''}</div><ul class="trades">${tr || '<li class="empty">No trades yet</li>'}</ul></section>`);
  if (!M.form) M.form = new window.ATSForm($('m5Form'), SCHEMA, set, { prefix: 'm5', onChange: fm => { $('m5Save').hidden = !fm.dirty; } });
  else M.form.patch(set);
  M.form.setDisabled(M.busy && false);
  const acct = `${esc(a.server || '')} · ${d.age_s != null ? 'heartbeat ' + d.age_s + 's' : ''}`; if ($('m5Acct').textContent !== acct) $('m5Acct').textContent = acct;
  const hint = s.min_lot != null ? `Broker: min lot ${s.min_lot}, step ${s.lot_step}, min stop about ${money(s.min_sl_usd)}, spread about ${money(s.spread_usd_min_lot)} a trade at min lot. Values are not blocked here; a broker rejection shows at the top.` : '';
  if ($('m5Hint').textContent !== hint) $('m5Hint').textContent = hint;
  $('m5Reset').hidden = !a.demo; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && (M.tab || M.home)) loop(); });
window.ATSMT5 = { show, render, load, data: () => M.d, chip, toggle, stop, busy: () => M.busy, form: () => M.form };
loop();
})();
