/* ATS v4 app: remote control + dashboard for the server bot. Views: Home, Stats, History, Settings. */
(() => {
'use strict';
const APP_VER = '4.0.3';
(function watchUpdates() {
  if (!('serviceWorker' in navigator)) return;
  const show = () => { const bar = document.getElementById('updBar'); if (!bar || !bar.hidden) return; bar.hidden = false; bar.onclick = () => location.reload(); };
  let refreshing = false;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (refreshing) return; refreshing = true; location.reload(); });
  }
  const track = reg => {
    const nudge = sw => { if (!sw) return; try { sw.postMessage('skipWaiting'); } catch (e) { } show(); };
    if (reg.waiting) nudge(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const inst = reg.installing; if (!inst) return;
      inst.addEventListener('statechange', () => { if (inst.state === 'installed' && navigator.serviceWorker.controller) nudge(reg.waiting || inst); });
    });
    const ping = () => reg.update().catch(() => { });
    setInterval(ping, 60e3);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) ping(); });
  };
  const start = () => navigator.serviceWorker.register('./sw.js?v=9', { scope: './' }).then(track).catch(() => { });
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
const R = window.ATSRemote, H = window.ATSHybrid, E = window.ATSEngine;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (x, sign) => x == null || isNaN(x) ? '—' : (sign && x > 0 ? '+' : x < 0 ? '−' : '') + '$' + Math.abs(+x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x, d = 1) => x == null ? '—' : (x * 100).toFixed(d) + '%';
const cls = x => x > 0 ? 'up' : x < 0 ? 'dn' : '';
const fmtT = (ep, withDay) => new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: 'Asia/Bahrain', hour: '2-digit', minute: '2-digit', second: withDay ? undefined : '2-digit', hour12: false }, withDay ? { day: 'numeric', month: 'short' } : {})).format(new Date(ep * 1000));
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>', down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>', x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>', lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5h.01"/></svg>', info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  hash: '<svg viewBox="0 0 24 24"><path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/></svg>', shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>', layers: '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>', wallet: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12.5h.01M3 10h18"/></svg>',
  server: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 7.5h.01M8 16.5h.01"/></svg>', refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/></svg>', zap: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M9 7V5h6v2M7 7l1 13h8l1-13"/></svg>',
};
const evIcon = l => ({ win: I.check, loss: I.x, error: I.alert, warn: I.swap, lock: I.lock, info: I.info }[l] || I.info);

/* ---------- theme: auto (system) / light / dark ---------- */
const mq = matchMedia('(prefers-color-scheme: dark)');
const themePref = () => { try { return localStorage.getItem('ats.theme2') || 'auto'; } catch (e) { return 'auto'; } };
function applyTheme() { const p = themePref(); const dark = p === 'dark' || (p === 'auto' && mq.matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', dark ? '#07090f' : '#f2f4f8')); }
function setTheme(p) { try { localStorage.setItem('ats.theme2', p); } catch (e) { } applyTheme(); renderSettings(); }
mq.addEventListener ? mq.addEventListener('change', applyTheme) : mq.addListener(applyTheme); applyTheme();

/* ---------- toasts: one at a time, dismissible, no stale pile-up ---------- */
let lastEv = null, lastToastKey = '', lastToastAt = 0, toastTimer = null;
function dismissToasts(immediate) {
  const box = $('toasts'); if (!box) return; clearTimeout(toastTimer); toastTimer = null;
  [...box.children].forEach(el => {
    if (immediate) { el.remove(); return; }
    if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 360);
  });
}
function toast(o) { if (typeof o === 'string') o = { level: 'info', title: o };
  const box = $('toasts'); if (!box) return;
  const key = (o.level || 'info') + '|' + (o.title || '') + '|' + (o.text || '');
  if (key === lastToastKey && Date.now() - lastToastAt < 1600) return; // de-dupe
  lastToastKey = key; lastToastAt = Date.now();
  dismissToasts(true);
  const el = document.createElement('div'); el.className = 'toast ' + (o.level || 'info'); el.setAttribute('role', 'status');
  el.innerHTML = `<span class="ti">${evIcon(o.level)}</span><span class="tt"><b>${esc(o.title)}</b>${o.text ? `<small>${esc(o.text)}</small>` : ''}</span>${o.t ? `<time>${fmtT(o.t).slice(0, 5)}</time>` : ''}<button type="button" class="toast-x" aria-label="Dismiss">${I.x}</button>`;
  const kill = ev => { if (ev) ev.stopPropagation(); if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 360); };
  el.onclick = kill; el.querySelector('.toast-x').onclick = kill;
  let y0 = null; el.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true }); el.addEventListener('touchmove', e => { if (y0 != null && e.touches[0].clientY - y0 < -12) kill(); }, { passive: true });
  box.appendChild(el); toastTimer = setTimeout(kill, o.ms || (o.level === 'error' ? 6500 : 4200));
  if (navigator.vibrate && (o.level === 'error' || o.level === 'lock')) try { navigator.vibrate(30); } catch (e) { } }
const errToast = e => toast({ level: 'error', title: (e && e.message) || String(e) });
function catchUpEvents(st) { const evs = (st && st.events) || []; if (evs.length) lastEv = evs[evs.length - 1].id; }
function pumpEvents(st) { const evs = (st && st.events) || []; const top = evs.length ? evs[evs.length - 1].id : 0;
  if (lastEv == null) { lastEv = top; return; }
  const fresh = evs.filter(e => e.id > lastEv && !e.quiet);
  if (top > lastEv) lastEv = top;
  if (!fresh.length) return;
  // One toast for the batch: prefer an error/lock, otherwise the latest event.
  const ev = [...fresh].reverse().find(e => e.level === 'error' || e.level === 'lock' || e.level === 'warn') || fresh[fresh.length - 1];
  toast(ev); }

/* ---------- sheets ---------- */
function sheet(html, onMount) { dismissToasts(true); const w = $('sheetWrap'), s = $('sheet'); s.innerHTML = html; w.hidden = false; $('sheetBg').onclick = closeSheet; if (onMount) onMount(s); }
function closeSheet() { $('sheetWrap').hidden = true; $('sheet').innerHTML = ''; }
function ask({ title, text, ok = 'Continue', danger, real, html }) { return new Promise(res => {
  sheet(`<h2${real ? ' class="real-h"' : ''}>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${html || ''}<div class="btns"><button type="button" class="btn ${real ? 'real' : danger ? 'danger' : 'primary'} block" id="askOk">${esc(ok)}</button><button type="button" class="btn ghost block" id="askNo">Cancel</button></div>`, s => {
    s.querySelector('#askOk').onclick = () => { closeSheet(); res(true); }; s.querySelector('#askNo').onclick = () => { closeSheet(); res(false); }; });
  $('sheetBg').onclick = () => { closeSheet(); res(false); }; }); }

/* ---------- navigation ---------- */
let view = 'home';
function go(v) { view = v; for (const x of ['home', 'stats', 'history', 'settings']) { const el = $('v-' + x); el.hidden = x !== v; if (x === v) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; } }
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.go === v)); window.scrollTo({ top: 0 }); render(); }
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));

/* ---------- header ---------- */
const isReal = st => !!(st && st.mode === 'real');
const capOn = real => !!(real && +real.lifetime_cap > 0);
function renderHeader() { const st = R.st, b = st && st.bot, on = !!(b && (b.running || b.open));
  const badge = $('modeBadge'), dot = $('liveDot');
  badge.className = 'badge ' + (!st ? 'off' : isReal(st) ? 'real' : '');
  $('modeTxt').textContent = !st ? (R.hasKey() ? (R.err ? 'OFFLINE' : 'CONNECTING') : 'NOT PAIRED') : (isReal(st) ? 'REAL' : 'DEMO') + ' · SERVER';
  dot.className = 'live-dot' + (on ? (b.running ? ' on' : ' warn') : '');
  const bal = st && st.account && st.account.balance; $('acctBal').textContent = bal == null ? '—' : '$' + Number(bal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $('realStrip').hidden = !isReal(st);
  if (st && st.real && $('realStripTxt')) {
    const day = 'Daily stop −$' + (+st.real.day_sl_max || 2).toFixed(0);
    $('realStripTxt').textContent = capOn(st.real) ? `${day} · lifetime cap ${money(st.real.lifetime_cap)} (${money(st.real.room_left)} left)` : day;
  }
  $('brandSub').textContent = on ? (b.running ? 'Live · 24/7' : 'Stopping…') : 'Auto Trading'; }

/* ---------- home ---------- */
let prevPnl = null, prevPhase = null, prevDigit = null, prevTop = null;
function renderHome() {
  const paired = R.hasKey(); $('pairCard').hidden = paired && !R.authBad; $('homeMain').hidden = !paired || R.authBad;
  const st = R.st; if (!st) { $('statusTxt').textContent = !paired ? 'Not paired' : R.err ? R.err : 'Connecting…'; $('statusLine').className = 'status-line' + (R.err ? ' err' : ''); return; }
  const hy = st.hybrid, b = st.bot, d = hy.day, on = b.running || b.open, hyb = b.strategy === 'hybrid' || (b.params && b.params.strategy === 'hybrid');
  // today + bar
  const pnl = +d.pnl || 0, el = $('dayPnl'); el.textContent = money(pnl, true); el.className = 'big-pnl ' + cls(pnl);
  if (prevPnl != null && pnl !== prevPnl) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } prevPnl = pnl;
  $('daySub').textContent = `${d.trades} trade${d.trades === 1 ? '' : 's'} · new day at 00:00`;
  const chip = $('dayChip'); const ds = d.state; chip.className = 'chip ' + (ds === 'locked' ? 'ok' : ds === 'stopped' ? 'bad' : on ? 'acc' : '');
  chip.textContent = ds === 'locked' ? 'Goal locked' : ds === 'stopped' ? 'Day stopped' : on ? 'Trading' : b.state === 'halted' ? 'Halted' : 'Idle';
  const rt = $('resetTodayBtn'); if (rt) { rt.hidden = isReal(st); rt.disabled = isReal(st); }
  const stop = +d.stop || 2, lock = +d.lock || 1, z = stop / (stop + lock) * 100;
  document.querySelector('.pbar-neg').style.flex = stop; document.querySelector('.pbar-pos').style.flex = lock;
  document.querySelector('.pbar-zero').style.left = `calc(${z}% - 1px)`; document.querySelector('.pbar-lbl span:nth-child(2)').style.left = z + '%';
  const f = $('pbarFill'), k = $('pbarKnob');
  if (pnl >= 0) { const w = Math.min(1, pnl / lock) * (100 - z); f.style.left = z + '%'; f.style.width = w + '%'; f.className = 'pbar-fill pos'; k.style.left = (z + w) + '%'; k.className = 'pbar-knob' + (pnl > 0 ? ' pos' : ''); }
  else { const w = Math.min(1, -pnl / stop) * z; f.style.left = (z - w) + '%'; f.style.width = w + '%'; f.className = 'pbar-fill neg'; k.style.left = (z - w) + '%'; k.className = 'pbar-knob neg'; }
  $('pbarStop').textContent = `−$${stop.toFixed(2)} stop`; $('pbarLock').textContent = `+$${lock.toFixed(2)} lock`;
  $('dayTrades').textContent = d.trades; $('dayWin').textContent = d.trades ? Math.round(d.wins / d.trades * 100) + '%' : '—';
  const se = st.session; $('sesPnl').textContent = money(se.pnl, true); $('sesPnl').className = cls(se.pnl);
  $('nextStake').textContent = hy.next_stake != null ? '$' + (+hy.next_stake).toFixed(2) : on ? '—' : '$' + (+hy.params.stake).toFixed(2);
  // phase
  const rec = hy.phase === 'recovery' && on, card = $('phaseCard'); card.classList.toggle('rec', rec); card.classList.toggle('paused', !on || d.state !== 'trading');
  const pn = $('phaseName'), name = !hyb ? 'Classic analysis' : rec ? `Recovery · step ${hy.step}/${hy.params.mg_max_steps}` : 'Differs';
  if (prevPhase != null && prevPhase !== name) { pn.classList.remove('swap'); void pn.offsetWidth; pn.classList.add('swap'); } prevPhase = name; pn.textContent = name;
  $('phaseSub').textContent = !hyb ? `${b.cycle} cycle · Rise/Fall` : rec ? `Rise/Fall · ${hy.params.rec_secs}s · ×${hy.params.mg_factor}` : `Least digit · last ${hy.params.diff_lookback}` ;
  const dg = hy.digit, big = $('digitBig'), ring = $('ringFg'); const C = 2 * Math.PI * 28;
  ring.style.strokeDasharray = C;
  if (rec) { const lr = hy.last_rec; big.innerHTML = lr ? (lr.dir === 'up' ? '↑' : '↓') : '…'; big.nextElementSibling.textContent = lr ? (lr.dir === 'up' ? 'rise' : 'fall') : 'thinking'; ring.style.strokeDashoffset = C * (1 - hy.step / hy.params.mg_max_steps); }
  else { big.textContent = dg ? dg.digit : '–'; big.nextElementSibling.textContent = 'DIFFERS'; ring.style.strokeDashoffset = dg ? C * (Math.min(10, dg.freq[dg.digit]) / 10) : C;
    if (dg && prevDigit != null && dg.digit !== prevDigit) { big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop'); } prevDigit = dg ? dg.digit : null; }
  $('ladder').innerHTML = hyb ? hy.ladder.map(x => { const cur = on && (rec ? x.step === hy.step : x.step === 0); const done = rec && x.step > 0 && x.step < hy.step;
    return `<div class="rung${cur ? ' on' : ''}${x.step ? ' r' : ''}${done ? ' done' : ''}"><small>${x.step ? 'Step ' + x.step : 'Differs'}</small><b>$${x.stake.toFixed(2)}</b></div>`; }).join('') : '';
  const fq = dg && dg.freq; const mx = fq ? Math.max(...fq, 1) : 1;
  $('freq').hidden = !hyb; $('freq').innerHTML = fq ? fq.map((c, i) => `<div class="fq${i === dg.digit ? ' least' : ''}${i === dg.last ? ' last' : ''}"><i style="height:${Math.max(6, c / mx * 100)}%"></i><span>${i}</span></div>`).join('') : '';
  const lr = hy.last_rec; $('recLine').textContent = !hyb ? (st.last_analysis ? `${st.last_analysis.dir || 'neutral'} · ${st.last_analysis.conf}%` : '') : rec && lr ? `${lr.dir === 'up' ? 'Rise' : 'Fall'} · ${lr.how}` : dg ? `${dg.n} ticks · ${dg.digit} ×${dg.freq[dg.digit]} · last ${dg.last}` : '';
  // control
  const btn = $('goBtn'); btn.disabled = R.busy || (b.open && !b.running);
  btn.className = 'btn go block' + (on ? ' stop' : ''); $('goIco').innerHTML = on ? I.stop : I.play;
  $('goTxt').textContent = on ? (b.running ? 'Stop bot' : 'Stopping…') : (isReal(st) ? 'Start bot · Real' : 'Start ATS bot');
  if (!on && isReal(st)) btn.className = 'btn go real block';
  const ago = Math.round((Date.now() - R.lastOk) / 1000);
  $('statusLine').className = 'status-line' + (R.err ? ' err' : on ? ' on' : '');
  $('statusTxt').textContent = R.err ? 'Server unreachable: ' + R.err : (b.msg || 'Idle') + (ago > 8 ? ` · ${ago}s ago` : '');
  // recent
  const rows = hy.recent || []; const top = rows[0] ? rows[0].id : null;
  $('recent').innerHTML = rows.length ? rows.slice(0, 6).map((h, i) => tradeRow(h, i === 0 && prevTop != null && top !== prevTop)).join('') : '<li class="empty">No trades yet</li>'; prevTop = top;
}
function tradeRow(h, fresh) {
  const diff = h.phase === 'differs' || h.type === 'DIGITDIFF'; const set = h.status === 'settled';
  const ico = diff ? `<span class="t-ico d">≠${esc(h.barrier)}</span>` : `<span class="t-ico r">${h.type === 'CALL' ? I.up : I.down}</span>`;
  const title = diff ? `Differs ${esc(h.barrier)}` : `${h.type === 'CALL' ? 'Rise' : h.type === 'PUT' ? 'Fall' : esc(h.type)}${h.step ? ' · step ' + h.step : ''}`;
  const tags = (h.mode === 'real' ? '<span class="tag real">REAL</span>' : '') + (h.capped ? '<span class="tag cap">SMART</span>' : '') + (h.chain_end === 'bust' ? '<span class="tag bust">CHAIN LOST</span>' : '');
  return `<li${fresh ? ' class="new"' : ''}>${ico}<div class="t-main"><b>${title}${tags}</b><small>${fmtT(h.t)} · $${(+h.stake).toFixed(2)}${diff ? ' · 1 tick' : ''}</small></div><div class="amt ${set ? cls(h.profit) : 'muted'}">${set ? money(h.profit, true) : h.status === 'open' ? 'Open' : esc(h.status)}<small>${set ? (h.profit > 0 ? 'won' : 'lost') : ''}</small></div></li>`;
}
$('goBtn').onclick = async () => { const st = R.st; if (!st) return; const b = st.bot;
  if (b.running || b.open) { try { await R.stop(); } catch (e) { errToast(e); } return; }
  if (isReal(st)) { const p = st.hybrid.params;
    const ok = await ask({ title: 'Start on real money?', text: `Daily stop −$${(+p.day_sl).toFixed(0)} applies.`, real: true, ok: 'Start' });
    if (!ok) return; }
  try { await R.start(); } catch (e) { errToast(e); } };

/* ---------- stats ---------- */
function meter(v, be) { const w = v == null ? 0 : Math.max(0, Math.min(100, v * 100)); const ok = v != null && be != null && v >= be;
  return `<div class="meter"><i class="${v == null ? '' : ok ? 'ok' : 'bad'}" style="width:${w}%"></i>${be != null ? `<em style="left:${be * 100}%"></em>` : ''}</div>`; }
function renderStats() {
  const s = R.stats, el = $('statsBody'); if (!s) { el.innerHTML = '<div class="card"><p class="muted">Loading…</p></div>'; return; }
  const be = s.breakeven || {}; const dBE = be.differs || 0.946, rBE = be.recovery || 0.513;
  const ch = s.chains; const hrs = Array(24).fill(null); for (const h of s.by_hour) hrs[h.hour] = h; const mx = Math.max(0.01, ...s.by_hour.map(h => Math.abs(h.pnl)));
  el.innerHTML = `
  <div class="st-grid">
    <div class="st"><span class="eyebrow">Differs</span><div class="st-num">${pct(s.differs.winrate)}</div>${meter(s.differs.winrate, dBE)}<small>${s.differs.n} trades · needs ${pct(dBE)}</small></div>
    <div class="st"><span class="eyebrow">Recovery</span><div class="st-num">${pct(s.recovery.winrate)}</div>${meter(s.recovery.winrate, rBE)}<small>${s.recovery.n} trades · needs ${pct(rBE)}</small></div>
    <div class="st"><span class="eyebrow">Chains saved</span><div class="st-num up">${ch.recovered}</div><small>${ch.started} started${ch.open ? ` · ${ch.open} open` : ''}</small></div>
    <div class="st"><span class="eyebrow">Chains lost</span><div class="st-num dn">${ch.busted + ch.cut_short}</div><small>${ch.busted} bust · ${ch.cut_short} cut</small></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="card-h"><h3>Recovery steps</h3></div>
    ${s.by_step.length ? s.by_step.map(x => `<div class="row"><div class="l"><b>Step ${x.step}</b><small>${x.n} trades · ${x.wins}–${x.losses}</small></div><div style="flex:1;max-width:130px">${meter(x.winrate, rBE)}</div><div class="r">${pct(x.winrate, 0)}<small class="${cls(x.pnl)}">${money(x.pnl, true)}</small></div></div>`).join('') : '<p class="empty">No recovery trades yet</p>'}</div>
  <div class="card"><div class="card-h"><h3>P/L by phase</h3></div>
    <div class="row"><div class="l"><b>Differs</b><small>${s.differs.n} trades · staked ${money(s.differs.staked)}</small></div><div class="r ${cls(s.differs.pnl)}">${money(s.differs.pnl, true)}</div></div>
    <div class="row"><div class="l"><b>Recovery</b><small>${s.recovery.n} trades · staked ${money(s.recovery.staked)}</small></div><div class="r ${cls(s.recovery.pnl)}">${money(s.recovery.pnl, true)}</div></div>
    <div class="row"><div class="l"><b>Total</b><small>${s.all.n} trades · ${pct(s.all.winrate)} won</small></div><div class="r ${cls(s.all.pnl)}">${money(s.all.pnl, true)}</div></div></div>
  ${(() => { const lt = (R.st && R.st.real) || {}; return `<div class="card"><div class="card-h"><h3>Real lifetime</h3></div>
    <div class="row"><div class="l"><b>Real P/L</b><small>${lt.lifetime_trades || 0} real trades</small></div><div class="r ${cls(lt.lifetime_pnl)}">${money(lt.lifetime_pnl, true)}</div></div>
    ${capOn(lt) ? `<div class="row"><div class="l"><b>Loss cap</b><small>${money(lt.room_left)} left</small></div><div class="r">${money(lt.lifetime_cap)}</div></div>` : ''}</div>`; })()}
  <div class="card"><div class="card-h"><h3>P/L by hour</h3></div>
    <div class="hours">${hrs.map(h => { const v = h ? h.pnl : 0, hh = Math.abs(v) / mx * 50; return `<div class="hb" title="${h ? h.hour + ':00 ' + money(v, true) : ''}">${v > 0 ? `<i class="p" style="height:${hh}%"></i>` : v < 0 ? `<i class="n" style="height:${hh}%"></i>` : ''}</div>`; }).join('')}</div>
    <div class="hours-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></div>
  <div class="card"><div class="card-h"><h3>Days</h3></div>${s.by_day.length ? s.by_day.slice(0, 10).map(x => `<div class="row"><div class="l"><b>${new Date(x.day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</b><small>${x.n} trades · ${pct(x.winrate, 0)} won</small></div><div class="r ${cls(x.pnl)}">${money(x.pnl, true)}</div></div>`).join('') : '<p class="empty">No days yet</p>'}</div>
  <div class="card"><div class="card-h"><h3>Differs by digit</h3></div><div class="freq" style="height:80px">${(() => { const m = Math.max(1, ...s.by_digit.map(x => x.n)); return s.by_digit.map((x, i) => `<div class="fq"><i style="height:${Math.max(6, x.n / m * 100)}%;background:${x.n ? (x.winrate >= dBE ? 'var(--green)' : 'var(--accent)') : 'var(--surface2)'}"></i><span>${i}</span></div>`).join(''); })()}</div>
</div>`;
}

/* ---------- history ---------- */
let hf = 'all';
document.querySelectorAll('#histSeg button').forEach(b => b.onclick = () => { hf = b.dataset.f; document.querySelectorAll('#histSeg button').forEach(x => x.classList.toggle('on', x === b)); renderHistory(); });
function histRows() { const rows = (R.hist && R.hist.rows) || []; return rows.filter(h => hf === 'all' || (hf === 'real' ? h.mode === 'real' : (h.phase || (h.strategy === 'hybrid' ? '' : 'classic')) === hf)).slice().reverse(); }
function renderHistory() { const rows = histRows();
  $('histList').innerHTML = rows.length ? rows.slice(0, 200).map(h => tradeRow({ t: h.t, id: h.contract_id, phase: h.phase, step: h.step, type: h.contract_type, barrier: h.barrier, stake: h.stake, profit: h.profit, status: h.status, mode: h.mode, capped: h.capped, chain_end: h.chain_end })).join('') : '<li class="empty">No trades here yet</li>'; }
$('exportBtn').onclick = () => { const rows = (R.hist && R.hist.rows) || []; const cols = ['t', 'contract_id', 'mode', 'strategy', 'phase', 'step', 'contract_type', 'barrier', 'stake', 'payout', 'profit', 'status', 'why'];
  const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => { const v = c === 't' ? new Date(r.t * 1000).toISOString() : r[c]; return v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v; }).join(','))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'ats-history.csv'; a.click(); };

/* ---------- settings ---------- */
let draft = null, gdraft = null, dirty = false;
const F = [ // [key, label, hint, type, unit, step, icon class, icon]
  ['g', 'Differs', [['stake', 'Base stake', '', 'n', '$', 0.01, 'c1', I.hash], ['diff_lookback', 'Lookback', '', 'n', 't', 1, 'c1', I.layers], ['diff_gap', 'Gap', '', 'n', 's', 0.5, 'c1', I.clock]]],
  ['g', 'Recovery', [['rec_secs', 'Duration', '', 'n', 's', 1, 'c2', I.clock], ['mg_factor', 'Factor', '', 'n', '×', 0.1, 'c2', I.zap], ['mg_max_steps', 'Steps', '', 'n', '', 1, 'c2', I.layers], ['smart_mg', 'Smart martingale', '', 'b', '', 0, 'c2', I.shield]]],
  ['g', 'Daily limits', [['day_tp', 'Profit lock', '', 'n', '$', 0.5, 'c3', I.lock], ['day_sl', 'Daily stop', '', 'n', '$', 0.5, 'c4', I.shield]]],
  ['g', 'Safety', [['session_sl', 'Session stop-loss', '', 'n', '$', 0.5, 'c4', I.shield], ['session_tp', 'Session take-profit', '', 'n', '$', 0.5, 'c3', I.target], ['max_consec_losses', 'Max losses in a row', '', 'n', '', 1, 'c5', I.x], ['max_stake', 'Max stake', '', 'n', '$', 0.5, 'c5', I.wallet]]],
];
const CLASSIC = [['g', 'Classic analysis', [['stake', 'Stake', '', 'n', '$', 0.01, 'c1', I.wallet], ['cycle', 'Cycle', '', 's', '', 0, 'c1', I.clock], ['direction', 'Direction', '', 'd', '', 0, 'c1', I.target], ['martingale', 'Martingale', '×factor after a loss', 'b', '', 0, 'c2', I.zap], ['mg_factor', 'Factor', '', 'n', '×', 0.1, 'c2', I.zap], ['mg_max_steps', 'Steps', '', 'n', '', 1, 'c2', I.layers]]],
  ['g', 'Safety', [['session_sl', 'Session stop-loss', '', 'n', '$', 0.5, 'c4', I.shield], ['session_tp', 'Take-profit', '', 'n', '$', 0.5, 'c3', I.target], ['max_consec_losses', 'Max losses in a row', '', 'n', '', 1, 'c5', I.x], ['max_stake', 'Max stake', '', 'n', '$', 0.5, 'c5', I.wallet]]]];
function fieldHtml([k, label, hint, type, unit, step, ic, icon]) {
  const v = draft[k]; let ctl;
  if (type === 'b') ctl = `<label class="switch"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}><span></span></label>`;
  else if (type === 's') ctl = `<select data-k="${k}">${E.CYCLE_OPTS.filter(o => !['custom', 'ticks'].includes(o[0])).map(o => `<option value="${o[0]}"${o[0] === v ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`;
  else if (type === 'd') ctl = `<select data-k="${k}">${[['analysis', 'Analysis'], ['up', 'Always Rise'], ['down', 'Always Fall'], ['alternate', 'Alternate']].map(o => `<option value="${o[0]}"${o[0] === v ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`;
  else ctl = `${unit === '$' ? '<span class="unit">$</span>' : ''}<input type="number" inputmode="decimal" step="${step}" data-k="${k}" value="${v}">${unit && unit !== '$' ? `<span class="unit" style="margin:0">${unit}</span>` : ''}`;
  return `<div class="item"><span class="ic ${ic}">${icon}</span><div class="lab"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</div>${ctl}</div>`; }
function renderSettings() {
  if (view !== 'settings') return; const st = R.st, el = $('setBody');
  if (!st) { el.innerHTML = '<div class="card"><p class="muted">Connect your server first.</p></div>'; return; }
  if (!draft || !dirty) { draft = Object.assign({}, st.bot.params); gdraft = Object.assign({}, st.global); }
  const on = st.bot.running || st.bot.open, real = st.real, pref = themePref(), hyb = draft.strategy === 'hybrid';
  const groups = hyb ? F : CLASSIC;
  el.innerHTML = `
  ${on ? `<div class="notice">${I.info}<span>Stop the bot to change settings.</span></div>` : ''}
  <div class="group"><div class="group-t">Strategy</div><div class="seg" id="stratSeg" style="margin:0"><button type="button" data-s="hybrid" class="${hyb ? 'on' : ''}">ATS bot</button><button type="button" data-s="classic" class="${draft.strategy === 'classic' ? 'on' : ''}"${isReal(st) ? ' disabled' : ''}>Classic</button></div></div>
  ${groups.map(([, t, fs]) => `<div class="group"><div class="group-t">${t}</div><div class="list">${fs.map(fieldHtml).join('')}</div></div>`).join('')}
  <div class="group"><div class="group-t">Session limits</div><div class="list">
    <div class="item"><span class="ic c4">${I.shield}</span><div class="lab"><b>Stop at loss</b></div><span class="unit">$</span><input type="number" inputmode="decimal" step="0.5" data-g="sl" value="${gdraft.sl}"></div>
    <div class="item"><span class="ic c3">${I.target}</span><div class="lab"><b>Stop at profit</b></div><span class="unit">$</span><input type="number" inputmode="decimal" step="0.5" data-g="tp" value="${gdraft.tp}"></div></div>
    <p class="note" style="margin:8px 6px 0">${money(st.session.pnl, true)} · <button type="button" class="link" id="newSess"${on ? ' disabled' : ''}>New session</button></p></div>
  <div class="group"><div class="group-t">Account</div><div class="list">
    <div class="item"><span class="ic ${isReal(st) ? 'c6' : 'c1'}">${I.wallet}</span><div class="lab"><b>${isReal(st) ? 'Real account' : 'Demo account'}</b><small>${esc(st.account.prefix || '')} · balance ${st.account.balance == null ? '—' : money(st.account.balance)}</small></div><button type="button" class="link" id="openAcct">Switch</button></div></div></div>
  <div class="group"><div class="group-t">Real money</div><div class="list">
    <div class="item"><span class="ic c6">${I.shield}</span><div class="lab"><b>Lifetime loss cap</b><small>${capOn(real) ? `${money(real.lifetime_lost)} lost · ${money(real.room_left)} left` : 'Off'}</small></div><label class="switch"><input type="checkbox" id="capOn"${capOn(real) ? ' checked' : ''}><span></span></label></div>
    ${capOn(real) ? `<div class="item"><span class="ic c6">${I.wallet}</span><div class="lab"><b>Cap amount</b></div><span class="unit">$</span><input type="number" inputmode="decimal" step="1" min="1" id="capIn" value="${real.lifetime_cap}"></div>` : ''}</div></div>
  ${isReal(st) ? '' : `<div class="group"><div class="group-t">Demo tools</div><div class="list">
    <div class="item"><span class="ic c3">${I.refresh}</span><div class="lab"><b>Reset today</b></div><button type="button" class="link" id="resetTodaySet">Reset</button></div>
    <div class="item"><span class="ic c6">${I.refresh}</span><div class="lab"><b>Reset demo balance</b></div><button type="button" class="link" id="resetDemo">Reset</button></div>
    <div class="item"><span class="ic c5">${I.trash}</span><div class="lab"><b>Clear history</b></div><button type="button" class="link" id="clearHist">Clear</button></div></div></div>`}
  <div class="group"><div class="group-t">Appearance</div><div class="seg" id="themeSeg" style="margin:0">${['auto', 'light', 'dark'].map(t => `<button type="button" data-t="${t}" class="${pref === t ? 'on' : ''}">${t === 'auto' ? 'Automatic' : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
  <div class="group"><div class="group-t">Server</div><div class="list">
    <div class="item"><span class="ic c5">${I.server}</span><div class="lab"><b>Connected</b><small>${esc(R.url().replace('https://', ''))}</small></div><button type="button" class="link" id="forgetKey" style="color:var(--red)">Unpair</button></div>
    <a class="item" href="legacy/" style="color:inherit;text-decoration:none"><span class="ic c5">${I.phone}</span><div class="lab"><b>Classic app</b></div><svg class="chev" viewBox="0 0 24 24" style="transform:rotate(-90deg)"><path d="M7 10l5 5 5-5"/></svg></a></div></div>
  <p class="note">ATS v${APP_VER}</p>
  ${dirty ? `<div class="save-bar"><button type="button" class="btn ghost" id="discard">Discard</button><button type="button" class="btn primary" id="saveSet">Save changes</button></div>` : ''}`;
  el.querySelectorAll('[data-k]').forEach(inp => inp.oninput = inp.onchange = () => { const k = inp.dataset.k; draft[k] = inp.type === 'checkbox' ? inp.checked : inp.tagName === 'SELECT' ? inp.value : inp.value === '' ? '' : +inp.value; markDirty(); });
  el.querySelectorAll('[data-g]').forEach(inp => inp.oninput = () => { gdraft[inp.dataset.g] = +inp.value; markDirty(); });
  el.querySelectorAll('input,select').forEach(x => { if (on && x.id !== 'capIn' && x.id !== 'capOn') x.disabled = true; });
  el.querySelectorAll('#stratSeg button').forEach(b => b.onclick = () => { if (on || b.disabled) return; draft.strategy = b.dataset.s; dirty = true; renderSettings(); });
  el.querySelectorAll('#themeSeg button').forEach(b => b.onclick = () => setTheme(b.dataset.t));
  const q = id => el.querySelector('#' + id);
  if (q('saveSet')) q('saveSet').onclick = async () => { try { const g = st.global; if (gdraft.sl !== g.sl || gdraft.tp !== g.tp) await R.saveGlobal(gdraft); await R.saveParams(draft); dirty = false; toast({ level: 'win', title: 'Saved' }); renderSettings(); } catch (e) { errToast(e); } };
  if (q('discard')) q('discard').onclick = () => { dirty = false; renderSettings(); };
  q('newSess').onclick = async () => { if (await ask({ title: 'New session?', text: 'Session P/L goes back to $0.', ok: 'Start' })) R.newSession().then(() => toast({ level: 'info', title: 'New session' }), errToast); };
  q('openAcct').onclick = openAccount;
  if (q('resetDemo')) q('resetDemo').onclick = resetDemo;
  if (q('resetTodaySet')) q('resetTodaySet').onclick = resetToday;
  if (q('clearHist')) q('clearHist').onclick = clearHistory;
  if (q('capOn')) q('capOn').onchange = async () => {
    try {
      if (q('capOn').checked) { await R.realCap(10, false); toast({ level: 'info', title: 'Lifetime cap on' }); }
      else { await R.realCap(0, false); toast({ level: 'info', title: 'Lifetime cap off' }); }
      renderSettings();
    } catch (e) { errToast(e); renderSettings(); }
  };
  if (q('capIn')) q('capIn').onchange = async () => { const v = +q('capIn').value; if (!(v >= 1)) { renderSettings(); return; } const up = v > +real.lifetime_cap;
    if (up && !(await ask({ title: 'Raise the lifetime cap?', text: `Allow up to ${money(v)} of total real losses.`, ok: 'Raise' }))) { renderSettings(); return; }
    R.realCap(v, up).then(() => toast({ level: 'info', title: 'Lifetime cap set', text: money(v) }), errToast); };
  q('forgetKey').onclick = async () => { if (await ask({ title: 'Unpair this phone?', text: 'The key is removed from this phone.', ok: 'Unpair', danger: true })) { R.forget(); render(); go('home'); } };
}
function markDirty() { if (!dirty) { dirty = true; const keep = document.activeElement && document.activeElement.dataset; const k = keep && (keep.k || keep.g); renderSettings(); if (k) { const i = document.querySelector(`[data-k="${k}"],[data-g="${k}"]`); if (i) { i.focus(); try { const l = i.value.length; i.setSelectionRange(l, l); } catch (e) { } } } } }

/* ---------- account sheet: Demo / Real, reset demo, reset today ---------- */
function openAccount() { const st = R.st; if (!st) return; const real = st.real, a = st.account, rl = isReal(st);
  const err = a.error && !a.verified ? a.error : '';
  sheet(`<span class="eyebrow">${rl ? 'Real account' : 'Demo account'}</span><div class="bal">${a.balance == null ? '—' : money(a.balance)}</div><p class="muted" style="margin:0">${esc(a.prefix || '')}${a.verified ? ' · verified' : ''}</p>
    <div class="seg acct" style="margin-top:18px"><button type="button" data-m="demo" class="${rl ? '' : 'on'}">Demo</button><button type="button" data-m="real" class="${rl ? 'on real' : ''}"${!real.available && !rl ? ' disabled' : ''}>Real</button></div>
    ${!real.available ? `<div class="notice bad">${I.alert}<span>${esc(real.reason)}</span></div>` : ''}
    ${err ? `<div class="notice bad">${I.alert}<span>${esc(err)}</span></div>` : ''}
    ${real.disabled_reason && !rl ? `<p class="note" style="margin:0">${esc(real.disabled_reason)}</p>` : ''}
    <div class="btns">${rl ? '' : `<button type="button" class="btn block" id="shDay">Reset today</button><button type="button" class="btn ghost block" id="shReset">Reset demo balance</button>`}<button type="button" class="btn ghost block" id="shClose">Done</button></div>`, s => {
    s.querySelector('#shClose').onclick = closeSheet;
    const resetBtn = s.querySelector('#shReset'); if (resetBtn) resetBtn.onclick = () => { closeSheet(); resetDemo(); };
    const dayBtn = s.querySelector('#shDay'); if (dayBtn) dayBtn.onclick = () => { closeSheet(); resetToday(); };
    s.querySelectorAll('.seg.acct button').forEach(b => b.onclick = () => { if (b.disabled) return; const m = b.dataset.m; if ((m === 'real') === rl) return; if (m === 'real') enableReal(); else { closeSheet(); disableReal(); } }); }); }
$('acctPill').onclick = () => { if (!R.st) { if (!R.hasKey()) go('home'); return; } openAccount(); };
async function enableReal() { const st = R.st, real = st.real;
  if (!real.available) { sheet(`<h2>Real mode isn’t available</h2><p>${esc(real.reason)}</p><div class="btns"><button type="button" class="btn ghost block" id="realNo">OK</button></div>`, s => { s.querySelector('#realNo').onclick = closeSheet; }); return; }
  if (st.bot.running || st.bot.open) { sheet(`<h2>Stop the bot first</h2><div class="btns"><button type="button" class="btn ghost block" id="realNo">OK</button></div>`, s => { s.querySelector('#realNo').onclick = closeSheet; }); return; }
  if (!(await ask({ title: 'Switch to Real money?', text: 'The bot will trade your real balance. Daily stop −$2 applies.', real: true, ok: 'Switch' }))) return;
  try { await R.realOn(); catchUpEvents(R.st); toast({ level: 'warn', title: 'Real money mode on' }); } catch (e) { errToast(e); } }
async function disableReal() { try { await R.realOff(); catchUpEvents(R.st); toast({ level: 'info', title: 'Back on demo' }); } catch (e) { errToast(e); } }
async function resetDemo() { if (!(await ask({ title: 'Reset demo balance?', text: 'Demo balance returns to the default. Real money is not touched.', ok: 'Reset' }))) return;
  try { const d = await R.resetDemo(); catchUpEvents(R.st); toast({ level: 'win', title: 'Demo balance reset', text: d.balance != null ? money(d.balance) : '' }); } catch (e) { errToast(e); } }
async function resetToday() { const st = R.st; if (!st) return;
  if (isReal(st)) { sheet(`<h2>Can’t reset today on real</h2><p>Switch to demo first.</p><div class="btns"><button type="button" class="btn ghost block" id="ok">OK</button></div>`, s => { s.querySelector('#ok').onclick = closeSheet; }); return; }
  if (!(await ask({ title: 'Reset today?', text: 'Today’s P/L goes back to $0. History is kept.', ok: 'Reset' }))) return;
  try { await R.resetToday(); catchUpEvents(R.st); toast({ level: 'info', title: 'Today reset' }); } catch (e) { errToast(e); } }
if ($('resetTodayBtn')) $('resetTodayBtn').onclick = resetToday;
async function clearHistory() { const st = R.st; if (!st) return;
  if (isReal(st)) { sheet(`<h2>Can’t clear history on real</h2><p>Switch to demo first.</p><div class="btns"><button type="button" class="btn ghost block" id="ok">OK</button></div>`, s => { s.querySelector('#ok').onclick = closeSheet; }); return; }
  if (st.bot.running || st.bot.open) { sheet(`<h2>Stop the bot first</h2><div class="btns"><button type="button" class="btn ghost block" id="ok">OK</button></div>`, s => { s.querySelector('#ok').onclick = closeSheet; }); return; }
  if (!(await ask({ title: 'Clear history?', text: 'Demo trades and stats are wiped. This can’t be undone.', ok: 'Clear', danger: true }))) return;
  try { await R.clearHistory(); catchUpEvents(R.st); toast({ level: 'info', title: 'History cleared' }); } catch (e) { errToast(e); } }

/* ---------- pairing ---------- */
$('pairBtn').onclick = async () => { const k = ($('pairInput').value || '').trim(); $('pairErr').textContent = '';
  try { if (/^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(k)) await R.pair(k); else if (k.length >= 32) { R.setKey(k); await R.api('GET', '/api/status'); } else throw new Error('Enter the 8-character pairing code');
    R.authBad = false; $('pairInput').value = ''; toast({ level: 'win', title: 'Connected' }); await R.refresh(true); R.kick(); }
  catch (e) { if (e.status === 401) R.forget(); $('pairErr').textContent = e.message; } };
$('pairInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('pairBtn').click(); });

/* ---------- render loop ---------- */
function render() { renderHeader(); if (view === 'home') renderHome(); else if (view === 'stats') renderStats(); else if (view === 'history') renderHistory(); else renderSettings(); }
R.on(() => { pumpEvents(R.st); if (view === 'settings' && dirty) { renderHeader(); return; } if (view === 'settings' && document.activeElement && document.activeElement.closest && document.activeElement.closest('#setBody')) { renderHeader(); return; } render(); });
window.ATSApp = { go, toast, render, setTheme, openAccount };
render(); R.kick();
})();
