/* ATS MT5 tab: dashboard + live-editable inputs for ATS_V25 (Deriv-Demo).
 * Data: GET /api/mt5. Controls: POST /api/mt5/control, /close, /settings, /day/reset, /history/clear. DEMO ONLY. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (x, sign) => x == null || isNaN(x) ? '—' : (sign && x > 0 ? '+' : x < 0 ? '−' : '') + '$' + Math.abs(+x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cls = x => x > 0 ? 'up' : x < 0 ? 'dn' : '';
const tm = ep => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bahrain', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ep * 1000));
const dur = s => s < 60 ? Math.max(1, Math.round(s)) + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.floor(s / 3600) + 'h ' + Math.round(s % 3600 / 60) + 'm';
const UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 15l6-6 6 6"/></svg>', DN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9l6 6 6-6"/></svg>';
const STATE = { in_trade: ['In a trade', 'acc'], watching: ['Watching', 'ok'], pause: ['Between sessions', 'warn'], locked: ['Day locked', 'ok'], stopped: ['Day stopped', 'bad'],
  halted: ['Halted', 'bad'], off: ['Stopped', ''], algo_off: ['Algo off', 'bad'], connecting: ['Connecting', 'warn'], refused: ['Refused', 'bad'], starting: ['Starting', 'warn'] };
const FIELDS = [
  ['g', 'Trade', [
    ['symbol', 'Symbol', 's'], ['lots', 'Lot size', 'n', 0.001], ['tp_usd', 'Take profit', 'n', 0.01, '$'], ['sl_usd', 'Stop loss', 'n', 0.01, '$'],
    ['reverse', 'Reverse signals', 'b'], ['max_minutes', 'Max trade minutes', 'i', 1], ['deviation', 'Max slippage', 'i', 1]
  ]],
  ['g', 'Signal', [
    ['conf', 'Agreement threshold', 'i', 1, '%'], ['min_score', 'Min |score|', 'n', 0.01], ['check_sec', 'Check interval', 'i', 1, 's']
  ]],
  ['g', 'Sessions', [
    ['sessions_on', 'Sessions', 'b'], ['sessions', 'Sessions per day', 'i', 1], ['ses_tp', 'Session target', 'n', 0.01, '$'],
    ['ses_sl', 'Session stop', 'n', 0.01, '$'], ['ses_pause', 'Pause between', 'i', 1, 's']
  ]],
  ['g', 'Daily limits', [
    ['day_tp', 'Daily lock', 'n', 0.01, '$'], ['day_sl', 'Daily stop', 'n', 0.01, '$'],
    ['max_losses', 'Loss-streak halt', 'i', 1], ['smart_cap', 'Cut SL to room left', 'b']
  ]],
  ['g', 'EA', [
    ['magic', 'Magic number', 'i', 1], ['tz_offset', 'Day-reset TZ offset', 'i', 1, 's']
  ]]
];
const M = { d: null, err: null, at: 0, busy: false, on: false, t: null, draft: null, dirty: false };
async function load() {
  const R = window.ATSRemote; if (!R || !R.hasKey()) { M.err = 'Connect your server on Home first'; return; }
  try { M.d = await R.api('GET', '/api/mt5'); M.err = null; M.at = Date.now();
    if (!M.dirty) M.draft = Object.assign({}, (M.d.ea && M.d.ea.settings) || {});
  } catch (e) { M.err = e.message; }
}
function loop() { clearTimeout(M.t); if (!M.on) return; (async () => { if (!document.hidden) { await load(); render(); } M.t = setTimeout(loop, M.d && M.d.ea && M.d.ea.position ? 2000 : 4000); })(); }
function show(on) { M.on = on; if (on) { M.dirty = false; render(); loop(); } else clearTimeout(M.t); }
async function act(path, body, okMsg) { const R = window.ATSRemote, A = window.ATSApp; M.busy = true; render();
  try { M.d = await R.api('POST', path, body); if (A && okMsg) A.toast({ level: 'win', title: okMsg }); } catch (e) { if (A) A.toast({ level: 'error', title: e.message }); }
  M.busy = false; M.dirty = false; await load(); render(); }
async function toggle() { const running = M.d && M.d.control === 'run'; const A = window.ATSApp;
  if (running) { const ok = A && A.ask ? await A.ask({ title: 'Stop the MT5 bot?', text: 'It stops opening new trades. An open trade keeps its stop loss and take profit.', ok: 'Stop', danger: true }) : confirm('Stop the MT5 bot?'); if (ok) act('/api/mt5/control', { state: 'stop' }, 'MT5 bot stopped'); }
  else act('/api/mt5/control', { state: 'run' }, 'MT5 bot started'); }
async function closeNow() { const A = window.ATSApp; const ok = A && A.ask ? await A.ask({ title: 'Close the MT5 trade now?', text: 'It closes at the current price, win or lose.', ok: 'Close now', danger: true }) : confirm('Close now?');
  if (ok) act('/api/mt5/close', {}, 'Close sent'); }
function isDemo() { const a = M.d && M.d.ea && M.d.ea.account; return !!(a && a.demo); }
async function resetToday() { const A = window.ATSApp;
  if (!isDemo()) { if (A && A.toast) A.toast({ level: 'error', title: 'Reset is only available on demo' }); return; }
  if (!(A && A.ask ? await A.ask({ title: 'Reset today?', text: 'Today’s P/L, sessions and lock/stop flags go back to the start of the day. History is kept. The Deriv statement is not changed.', ok: 'Reset' }) : confirm('Reset today?'))) return;
  act('/api/mt5/day/reset', {}, 'Today reset'); }
async function clearHist() { const A = window.ATSApp;
  if (!isDemo()) { if (A && A.toast) A.toast({ level: 'error', title: 'Clear history is only available on demo' }); return; }
  const run = M.d && M.d.control === 'run', open = M.d && M.d.ea && M.d.ea.position;
  if (run || open) { if (A && A.toast) A.toast({ level: 'error', title: open ? 'Close or wait for the open trade first' : 'Stop the MT5 bot first' }); return; }
  if (!(A && A.ask ? await A.ask({ title: 'Clear history?', text: 'MT5 trades disappear from this app. Today’s P/L is also reset. This can’t be undone. The Deriv account statement is not changed.', ok: 'Clear', danger: true }) : confirm('Clear MT5 history in the app?'))) return;
  act('/api/mt5/history/clear', {}, 'History cleared'); }
function fieldRow(k, label, type, step, unit) {
  const v = M.draft && M.draft[k]; let ctl;
  if (type === 'b') ctl = `<label class="switch"><input type="checkbox" data-mt5="${k}" ${v === true || v === 'true' || v === '1' || v === 1 ? 'checked' : ''}><span></span></label>`;
  else ctl = `${unit === '$' ? '<span class="unit">$</span>' : ''}<input type="${type === 's' ? 'text' : 'number'}" ${type !== 's' ? `inputmode="decimal" step="${step || 1}"` : ''} data-mt5="${k}" value="${esc(v == null ? '' : v)}">${unit && unit !== '$' ? `<span class="unit" style="margin:0">${esc(unit)}</span>` : ''}`;
  return `<div class="item"><div class="lab"><b>${esc(label)}</b></div>${ctl}</div>`;
}
async function saveSettings() {
  const A = window.ATSApp, R = window.ATSRemote; if (!R) return;
  const body = Object.assign({}, M.draft);
  M.busy = true; render();
  try {
    M.d = await R.api('POST', '/api/mt5/settings', body);
    M.dirty = false;
    if (A) A.toast({ level: 'win', title: 'MT5 settings saved', text: 'The EA applies them live' });
    const err = M.d && M.d.ea && M.d.ea.last_order && M.d.ea.last_order.error;
    if (err && A) A.toast({ level: 'error', title: 'Broker / EA', text: err });
  } catch (e) { if (A) A.toast({ level: 'error', title: e.message }); }
  M.busy = false; await load(); render();
}
function render() {
  const box = $('mt5Body'); if (!box || !M.on) return;
  if (!M.d) { box.innerHTML = `<div class="card"><p class="muted">${esc(M.err || 'Loading…')}</p></div>`; return; }
  const d = M.d, e = d.ea || {}, a = e.account || {}, s = e.symbol || {}, t = e.today || {}, ss = e.session || {}, p = e.position, g = e.signal || {}, set = e.settings || {};
  if (!M.draft) M.draft = Object.assign({}, set);
  const [stTxt, stCls] = !d.running ? (d.service !== 'active' ? ['Terminal down', 'bad'] : !d.fresh ? ['No heartbeat', 'bad'] : STATE[e.state] || [e.state, '']) : STATE[e.state] || [e.state || '—', ''];
  const run = d.control === 'run';
  const done = ss.done || [];
  const dots = Array.from({ length: ss.count || 0 }, (_, i) => { const lg = done[i]; const c = lg ? (lg.pnl > 0 ? 'w' : 'l') : i + 1 === ss.n && t.day_state === 'trading' ? 'c' : ''; return `<i class="${c}" title="Session ${i + 1}${lg ? ': ' + money(lg.pnl, true) : ''}"></i>`; }).join('');
  const stop = +set.day_sl || 4, lock = +set.day_tp || 3.5, z = stop / (stop + lock) * 100, pn = +t.pnl || 0;
  const fw = pn >= 0 ? Math.min(1, pn / lock) * (100 - z) : Math.min(1, -pn / stop) * z, fl = pn >= 0 ? z : z - fw;
  const lo = e.last_order || {};
  const errBanner = lo.error ? `<div class="notice bad mt5-err" role="alert"><span>${esc(lo.error)}</span></div>` : '';
  const pos = p ? `<div class="card mt5-pos"><div class="card-h"><span class="eyebrow">Open trade</span><span class="chip ${p.dir === 'up' ? 'ok' : 'bad'}">${p.dir === 'up' ? 'Buy' : 'Sell'} ${esc(p.lots)} lot</span></div>
      <div class="mt5-live ${cls(p.profit)}">${money(p.profit, true)}</div>
      <div class="sub">${esc(p.comment || '')} · opened ${tm(p.opened)} · ${dur(Date.now() / 1000 - p.opened)}</div>
      <div class="kv"><span>Entry → now</span><b>${(+p.open).toFixed(2)} → ${(+p.price).toFixed(2)}</b></div>
      <div class="kv"><span>Take profit / stop loss</span><b><span class="up">${money(p.tp_usd, true)}</span> / <span class="dn">${money(-p.sl_usd)}</span></b></div>
      <button type="button" class="btn danger block" id="mt5Close"${M.busy ? ' disabled' : ''}>Close now</button></div>` : '';
  const sig = g.error != null ? `<p class="muted">${esc(g.error || 'Waiting for the first check')}</p>` : `<div class="mt5-sig"><div><span class="eyebrow">Last check ${g.t ? tm(g.t) : ''}</span><b class="${g.lean === 'up' ? 'up' : g.lean === 'down' ? 'dn' : ''}">${g.lean === 'up' ? 'Up' : g.lean === 'down' ? 'Down' : 'Flat'} · ${g.agree}% agree</b><small>needs ${g.need}% · ${g.up} up / ${g.down} down of ${g.n} votes${set.reverse ? ' · signals reversed' : ''}</small></div>
      <div class="mt5-tf">${['m1', 'm5', 'm15', 'h1'].map(k => `<span class="${cls(g.tf && g.tf[k])}">${k.toUpperCase()}<b>${g.tf && g.tf[k] != null ? (g.tf[k] > 0 ? '+' : '') + (+g.tf[k]).toFixed(2) : '—'}</b></span>`).join('')}<span class="${cls(g.core)}">Core<b>${g.core != null ? (g.core > 0 ? '+' : '') + (+g.core).toFixed(2) : '—'}</b></span></div></div>`;
  const tr = (e.trades || []).slice(0, 12).map(x => `<li><span class="t-ico m ${x.dir === 'up' ? 'up' : 'dn'}">${x.dir === 'up' ? UP : DN}</span><div class="t-main"><b>${x.dir === 'up' ? 'Buy' : 'Sell'} ${esc(x.lots)}</b><small>${tm(x.open_t)} · ${dur(x.close_t - x.open_t)}</small></div><div class="amt ${cls(x.profit)}">${money(x.profit, true)}<small>${x.profit > 0 ? 'won' : 'lost'}</small></div></li>`).join('');
  const hint = s.min_lot != null ? `<p class="muted mt5-note">Broker on this symbol: min lot ${esc(s.min_lot)}, lot step ${esc(s.lot_step)}, min stop about ${money(s.min_sl_usd)}, spread about ${money(s.spread_usd_min_lot)} a trade. Values are not blocked here — if the broker rejects one, the error shows above.</p>` : '';
  const form = FIELDS.map(([, title, rows]) => `<div class="group"><div class="group-t">${title}</div><div class="list">${rows.map(r => fieldRow(r[0], r[1], r[2], r[3], r[4])).join('')}</div></div>`).join('');
  box.innerHTML = `
    ${errBanner}
    <div class="card mt5-hero">
      <div class="hero-top"><div><span class="eyebrow">Today · ${esc(set.symbol || s.name || 'V25 (1s) CFD')}</span><div class="big-pnl ${cls(t.pnl)}">${money(t.pnl, true)}</div><div class="sub">${esc(e.reason || '')}</div></div>
        <div class="hero-side"><span class="chip ${stCls}">${esc(stTxt)}</span><span class="chip">${a.demo ? 'DEMO' : '—'}</span>${a.demo ? '<button type="button" class="link" id="mt5ResetToday">Reset</button>' : ''}</div></div>
      <div class="pbar"><div class="pbar-track"><div class="pbar-neg" style="flex:${stop}"></div><div class="pbar-pos" style="flex:${lock}"></div><div class="pbar-fill ${pn >= 0 ? 'pos' : 'neg'}" style="left:${fl}%;width:${fw}%"></div><i class="pbar-zero" style="left:calc(${z}% - 1px)"></i><i class="pbar-knob${pn > 0 ? ' pos' : pn < 0 ? ' neg' : ''}" style="left:${pn >= 0 ? z + fw : z - fw}%"></i></div>
        <div class="pbar-lbl"><span>−$${stop.toFixed(2)} stop</span><span style="left:${z}%">$0</span><span>+$${lock.toFixed(2)} lock</span></div></div>
      <div class="hero-stats"><div><span class="eyebrow">Trades</span><b>${t.trades || 0}</b></div><div><span class="eyebrow">Win rate</span><b>${t.trades ? Math.round(t.wins / t.trades * 100) + '%' : '—'}</b></div>
        <div><span class="eyebrow">Session ${ss.n || 1}/${ss.count || '—'}</span><b class="${cls(ss.pnl)}">${money(ss.pnl, true)}</b></div><div><span class="eyebrow">Equity</span><b>${a.equity != null ? '$' + Math.round(a.equity).toLocaleString('en-US') : '—'}</b></div></div>
      <div class="ses-dots">${dots}</div>
      <button type="button" class="btn ${run ? 'ghost' : 'primary'} block mt5-go" id="mt5Toggle"${M.busy || e.state === 'refused' ? ' disabled' : ''}>${run ? 'Stop MT5 bot' : 'Start MT5 bot'}</button>
    </div>
    ${pos}
    <div class="card"><div class="card-h"><h3>Signal</h3><span class="muted">29 votes</span></div>${sig}</div>
    <div class="card"><div class="card-h"><h3>Recent MT5 trades</h3>${a.demo ? '<button type="button" class="link" id="mt5ClearHist">Clear history</button>' : ''}</div><ul class="trades">${tr || '<li class="empty">No trades yet</li>'}</ul></div>
    <div class="card" id="mt5SettingsCard">
      <div class="card-h"><h3>EA settings</h3><span class="muted">Live values</span></div>
      <div class="kv"><span>Account</span><b>${esc(a.login)} · ${esc(a.server)}</b></div>
      <div class="kv"><span>Balance / equity</span><b>${money(a.balance)} / ${money(a.equity)}</b></div>
      <div class="kv"><span>Heartbeat</span><b>${d.age_s != null ? d.age_s + 's ago' : '—'}</b></div>
      ${form}
      ${hint}
      ${M.dirty ? `<div class="save-bar"><button type="button" class="btn ghost" id="mt5Discard">Discard</button><button type="button" class="btn primary" id="mt5Save"${M.busy ? ' disabled' : ''}>Save changes</button></div>` : ''}
      ${a.demo ? `<div class="mt5-reset-row">${run ? '' : ''}<button type="button" class="btn ghost" id="mt5ResetToday2">Reset today</button></div>` : '<p class="muted mt5-note">Reset is only available on demo.</p>'}
    </div>`;
  const tg = $('mt5Toggle'); if (tg) tg.onclick = toggle; const cl = $('mt5Close'); if (cl) cl.onclick = closeNow;
  const rt = $('mt5ResetToday'); if (rt) rt.onclick = resetToday; const rt2 = $('mt5ResetToday2'); if (rt2) rt2.onclick = resetToday;
  const ch = $('mt5ClearHist'); if (ch) ch.onclick = clearHist;
  const sv = $('mt5Save'); if (sv) sv.onclick = saveSettings;
  const dc = $('mt5Discard'); if (dc) dc.onclick = () => { M.dirty = false; M.draft = Object.assign({}, set); render(); };
  box.querySelectorAll('[data-mt5]').forEach(inp => {
    inp.oninput = inp.onchange = () => {
      const k = inp.dataset.mt5;
      M.draft[k] = inp.type === 'checkbox' ? inp.checked : (inp.type === 'number' ? (inp.value === '' ? '' : +inp.value) : inp.value);
      if (!M.dirty) { M.dirty = true; /* keep focus */ const keep = k; render(); const n = box.querySelector(`[data-mt5="${keep}"]`); if (n) { n.focus(); try { const l = String(n.value || '').length; n.setSelectionRange(l, l); } catch (e) {} } }
    };
  });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && M.on) loop(); });
window.ATSMT5 = { show, render, load };
})();
