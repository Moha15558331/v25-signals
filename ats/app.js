/* ATS v4.3 app: remote control + dashboard for the server bot (Deriv Multipliers). Views: Home, Stats, History, Settings. */
(() => {
'use strict';
const APP_VER = '4.3.0';
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
  const start = () => navigator.serviceWorker.register('./sw.js?v=12', { scope: './' }).then(track).catch(() => { });
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
function go(v) { view = v; if (window.ATSMT5) window.ATSMT5.show(v === 'mt5'); for (const x of ['home', 'mt5', 'stats', 'history', 'settings']) { const el = $('v-' + x); el.hidden = x !== v; if (x === v) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; } }
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.go === v)); window.scrollTo({ top: 0 }); render(); }
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));

/* ---------- header ---------- */
const isReal = st => !!(st && st.mode === 'real');
const capOn = real => !!(real && +real.lifetime_cap > 0);
function renderHeader() { const st = R.st, b = st && st.bot, on = !!(b && (b.running || b.open)), running = !!(b && b.running);
  const badge = $('modeBadge'), dot = $('liveDot');
  badge.className = 'badge ' + (!st ? 'off' : isReal(st) ? 'real' : '');
  $('modeTxt').textContent = !st ? (R.hasKey() ? (R.err ? 'OFFLINE' : 'CONNECTING') : 'NOT PAIRED') : (isReal(st) ? 'REAL' : 'DEMO') + ' · SERVER';
  dot.className = 'live-dot' + (on ? (running ? ' on' : ' warn') : '');
  const bal = st && st.account && st.account.balance; $('acctBal').textContent = bal == null ? '—' : '$' + Number(bal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $('realStrip').hidden = !isReal(st);
  if (st && st.real && $('realStripTxt')) {
    const day = 'Daily stop −$' + (+st.real.day_sl_max || 2).toFixed(0);
    $('realStripTxt').textContent = capOn(st.real) ? `${day} · lifetime cap ${money(st.real.lifetime_cap)} (${money(st.real.room_left)} left)` : day;
  }
  $('brandSub').textContent = on ? (running ? 'Live · 24/7' : 'Stopping…') : 'Auto Trading'; }

/* ---------- home: the bot card (Start/Stop), today, phase ---------- */
let prevPnl = null, prevPhase = null, prevDigit = null, prevTop = null;
const sel = 'ats';
/** Sessions line: "Session 3/7 · +$0.20" (or "7/7 sessions" when the day is done). */
function sesLine(ss, d) { if (!ss || !ss.on) return null;
  if (d.state !== 'trading' || ss.done >= ss.count) return `${ss.done}/${ss.count} sessions · ${ss.won} won`;
  return `Session ${ss.current}/${ss.count} · ${money(ss.pnl, true)}`; }
/** Uniform view of the bot from /api/status. */
function botOf(st) {
  const mu = st.mult, b = st.bot, on = b.running || b.open, pos = mu.position;
  return { id: 'ats', name: 'ATS bot', running: b.running, open: b.open, on, state: b.state, msg: b.msg, day: mu.day, next: mu.next, params: mu.params, recent: mu.recent || [], ses: mu.sessions, pos,
    mkt: `${mu.symbol_name} ×${mu.params.m_mult}`,
    phase: !on ? (b.state === 'halted' ? 'Halted' : 'Idle') : pos ? `${pos.dir === 'up' ? 'Up' : 'Down'} open` : 'Watching' };
}
function stateChip(x) { const ds = x.day.state;
  return ds === 'locked' ? ['ok', 'Goal locked'] : ds === 'stopped' ? ['bad', 'Day stopped'] : x.on ? (x.running ? ['acc', 'Running'] : ['warn', 'Stopping']) : x.state === 'halted' ? ['bad', 'Halted'] : ['', 'Stopped']; }
function renderBots(st) {
  const real = isReal(st);
  $('bots').innerHTML = ['ats'].map(id => { const x = botOf(st); const [cc, ct] = stateChip(x); const off = false, sl = sesLine(x.ses, x.day);
    return `<div class="bot-card one${x.on ? ' live' : ''}" data-bot="${id}">
      <div class="bc-l"><div class="bc-top"><b>${x.name}</b><span class="chip ${cc}">${ct}</span></div>
      <div class="bc-sub">${esc([sl, x.on ? x.phase : null, x.mkt].filter(Boolean).join(' · '))}</div></div>
      <button type="button" class="bc-go${x.on ? ' stop' : ''}${!x.on && real ? ' real' : ''}" data-go-bot="${id}"${R.busy || (x.open && !x.running) || off ? ' disabled' : ''}>${x.on ? (x.running ? I.stop + 'Stop' : 'Stopping…') : I.play + 'Start'}</button></div>`; }).join('');
  $('bots').querySelectorAll('[data-go-bot]').forEach(b => b.onclick = e => { e.stopPropagation(); startStop(b.dataset.goBot); });
}
async function startStop(id) { const st = R.st; if (!st) return; const x = botOf(st);
  if (x.on) { try { await R.stop(id); } catch (e) { errToast(e); } return; }
  if (id === 'ats' && isReal(st)) { if (!(await ask({ title: 'Start on real money?', text: `Daily stop −$${(+x.params.day_sl).toFixed(0)} applies.`, real: true, ok: 'Start' }))) return; }
  try { await R.start(id); } catch (e) { errToast(e); } }
function renderHome() {
  const paired = R.hasKey(); $('pairCard').hidden = paired && !R.authBad; $('homeMain').hidden = !paired || R.authBad;
  const st = R.st; if (!st) { $('statusTxt').textContent = !paired ? 'Not paired' : R.err ? R.err : 'Connecting…'; $('statusLine').className = 'status-line' + (R.err ? ' err' : ''); return; }
  renderBots(st);
  const x = botOf(st), d = x.day, on = x.on;
  // today + bar
  const pnl = +d.pnl || 0, el = $('dayPnl'); el.textContent = money(pnl, true); el.className = 'big-pnl ' + cls(pnl);
  if (prevPnl != null && pnl !== prevPnl) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } prevPnl = pnl;
  $('daySub').textContent = `${x.name} · ${d.trades} trade${d.trades === 1 ? '' : 's'}`;
  const [cc, ct] = stateChip(x); const chip = $('dayChip'); chip.className = 'chip ' + cc; chip.textContent = ct;
  const rt = $('resetTodayBtn'); if (rt) { rt.hidden = isReal(st); rt.disabled = isReal(st); }
  const stop = +d.stop || 2, lock = +d.lock || 1, z = stop / (stop + lock) * 100;
  document.querySelector('.pbar-neg').style.flex = stop; document.querySelector('.pbar-pos').style.flex = lock;
  document.querySelector('.pbar-zero').style.left = `calc(${z}% - 1px)`; document.querySelector('.pbar-lbl span:nth-child(2)').style.left = z + '%';
  const f = $('pbarFill'), k = $('pbarKnob');
  if (pnl >= 0) { const w = Math.min(1, pnl / lock) * (100 - z); f.style.left = z + '%'; f.style.width = w + '%'; f.className = 'pbar-fill pos'; k.style.left = (z + w) + '%'; k.className = 'pbar-knob' + (pnl > 0 ? ' pos' : ''); }
  else { const w = Math.min(1, -pnl / stop) * z; f.style.left = (z - w) + '%'; f.style.width = w + '%'; f.className = 'pbar-fill neg'; k.style.left = (z - w) + '%'; k.className = 'pbar-knob neg'; }
  $('pbarStop').textContent = `−$${stop.toFixed(2)} stop`; $('pbarLock').textContent = `+$${lock.toFixed(2)} lock`;
  $('dayTrades').textContent = d.trades; $('dayWin').textContent = d.trades ? Math.round(d.wins / d.trades * 100) + '%' : '—';
  const ss = x.ses && x.ses.on ? x.ses : null, sv = ss ? ss.pnl : st.session.pnl;
  $('sesLbl').textContent = ss ? `Session ${Math.min(ss.current, ss.count)}/${ss.count}` : 'Session'; $('sesPnl').textContent = money(sv, true); $('sesPnl').className = cls(sv);
  const stk = x.pos ? x.pos.stake : x.next ? x.next.stake : x.params.m_stake; $('nextStake').textContent = stk != null ? '$' + (+stk).toFixed(2) : '—';
  $('sesDots').innerHTML = ss ? Array.from({ length: ss.count }, (_, i) => { const lg = ss.log[i]; const c = lg ? (lg.end === 'tp' ? 'w' : lg.pnl > 0 ? 'w' : 'l') : i + 1 === ss.current && d.state === 'trading' ? 'c' : '';
    return `<i class="${c}" title="Session ${i + 1}${lg ? ' ' + money(lg.pnl, true) : ''}"></i>`; }).join('') : '';
  renderPos(st, x);
  // status line
  const ago = Math.round((Date.now() - R.lastOk) / 1000);
  $('statusLine').className = 'status-line' + (R.err ? ' err' : on ? ' on' : '');
  $('statusTxt').textContent = R.err ? 'Server unreachable: ' + R.err : (x.msg || 'Idle') + (ago > 8 ? ` · ${ago}s ago` : '');
  // recent
  const rows = x.recent; const top = rows[0] ? rows[0].id : null;
  $('recent').innerHTML = rows.length ? rows.slice(0, 6).map((h, i) => tradeRow(h, i === 0 && prevTop != null && top !== prevTop)).join('') : '<li class="empty">No trades yet</li>'; prevTop = top;
}
const RING = 2 * Math.PI * 28;
const arrow = d => d === 'up' ? I.up : I.down;
function renderPos(st, x) {
  const mu = st.mult, p = x.pos, sg = mu.signal, on = x.on, card = $('posCard'), ring = $('ringFg'); ring.style.strokeDasharray = RING;
  card.classList.toggle('open', !!p); card.classList.toggle('paused', !on || x.day.state !== 'trading');
  card.classList.toggle('is-up', !!(p && p.dir === 'up')); card.classList.toggle('is-dn', !!(p && p.dir === 'down'));
  if (p) {
    const pl = p.pnl, tp = +p.tp, sl = +p.sl;
    $('posEye').textContent = 'Open position'; $('posName').innerHTML = `${arrow(p.dir)}${p.dir === 'up' ? 'Up' : 'Down'}`;
    $('posSub').textContent = `${mu.symbol_name} ×${p.mult} · $${(+p.stake).toFixed(2)}${p.conf != null ? ` · ${p.conf}%` : ''}`;
    $('ringBig').textContent = pl == null ? '…' : (pl >= 0 ? '+' : '−') + Math.abs(pl).toFixed(2); $('ringSmall').textContent = 'P/L';
    const frac = pl == null ? 0 : pl >= 0 ? Math.min(1, pl / tp) : Math.min(1, -pl / sl); ring.style.strokeDashoffset = RING * (1 - frac);
    ring.style.stroke = pl == null ? '' : pl >= 0 ? 'var(--green)' : 'var(--red)';
    const z = sl / (sl + tp) * 100, w = pl == null ? 0 : pl >= 0 ? Math.min(1, pl / tp) * (100 - z) : Math.min(1, -pl / sl) * z;
    const fill = pl == null ? '' : pl >= 0 ? `left:${z}%;width:${w}%` : `left:${z - w}%;width:${w}%`;
    $('posBody').innerHTML = `<div class="pos-grid"><div><span class="eyebrow">Entry</span><b>${p.entry != null ? (+p.entry).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'}</b></div>
      <div><span class="eyebrow">Now</span><b>${p.spot != null ? (+p.spot).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'}</b></div>
      <div><span class="eyebrow">P/L</span><b class="${cls(pl)}">${money(pl, true)}</b></div></div>
      <div class="pbar sm"><div class="pbar-track"><div class="pbar-neg" style="flex:${sl}"></div><div class="pbar-pos" style="flex:${tp}"></div><div class="pbar-fill ${pl >= 0 ? 'pos' : 'neg'}" style="${fill}"></div><i class="pbar-zero" style="left:calc(${z}% - 1px)"></i></div>
      <div class="pbar-lbl"><span>SL −$${sl.toFixed(2)}${p.capped ? ' · capped' : ''}</span><span style="left:${z}%">$0</span><span>TP +$${tp.toFixed(2)}</span></div></div>
      <div class="pos-foot"><span class="muted">Opened ${fmtT(p.t).slice(0, 5)}</span><button type="button" class="link dn" id="closePos"${R.busy ? ' disabled' : ''}>Close now</button></div>`;
    const cb = $('closePos'); if (cb) cb.onclick = closePos;
    return;
  }
  ring.style.stroke = '';
  const need = sg ? sg.need : +x.params.m_conf, conf = sg ? sg.conf : null, lean = sg && sg.lean;
  $('posEye').textContent = 'Signal';
  $('posName').innerHTML = !sg ? 'Waiting' : sg.dir ? `${arrow(sg.dir)}${sg.dir === 'up' ? 'Up' : 'Down'}` : lean ? `<span class="muted">${lean === 'up' ? 'Leaning up' : 'Leaning down'}</span>` : '<span class="muted">Mixed</span>';
  $('posSub').textContent = `${mu.symbol_name} ×${x.params.m_mult} · TP $${(+x.params.m_tp).toFixed(2)} / SL $${(+x.params.m_sl).toFixed(2)}`;
  $('ringBig').textContent = conf == null ? '–' : conf + '%'; $('ringSmall').textContent = `NEED ${need}%`;
  ring.style.strokeDashoffset = RING * (1 - (conf || 0) / 100); card.classList.toggle('ready', !!(sg && sg.dir));
  const tfs = sg && sg.tf ? Object.entries(sg.tf) : [];
  const chip = (k, v) => `<div class="tf ${v > 0.05 ? 'up' : v < -0.05 ? 'dn' : ''}"><small>${k}</small><b>${v > 0.05 ? '▲' : v < -0.05 ? '▼' : '•'} ${Math.abs(v).toFixed(2)}</b></div>`;
  $('posBody').innerHTML = sg ? `<div class="tfs">${tfs.map(([k, v]) => chip(k, v)).join('')}${sg.core && sg.core.score != null ? chip('Chart', +sg.core.score) : ''}</div>
    <div class="rec-line">${sg.up} up · ${sg.down} down of ${sg.n} votes · ${fmtT(sg.at).slice(0, 5)}</div>` : '<div class="rec-line">Start the bot to read the market.</div>';
}
async function closePos() { if (!(await ask({ title: 'Close the position now?', text: 'It sells at the current price.', ok: 'Close', danger: true }))) return;
  try { const d = await R.closePosition(); toast({ level: 'info', title: 'Position closed', text: d.sold_for != null ? 'Sold for ' + money(d.sold_for) : '' }); } catch (e) { errToast(e); } }
function tradeRow(h, fresh) {
  const set = h.status === 'settled', t = h.type, bot = h.bot_id || (h.phase === 'rf1h' ? 'rf1h' : 'ats');
  const mult = t === 'MULTUP' || t === 'MULTDOWN', diff = t === 'DIGITDIFF' || h.phase === 'differs', ou = t === 'DIGITOVER' || t === 'DIGITUNDER';
  const ico = mult ? `<span class="t-ico m ${t === 'MULTUP' ? 'up' : 'dn'}">${t === 'MULTUP' ? I.up : I.down}</span>` : diff ? `<span class="t-ico d">≠${esc(h.barrier)}</span>` : ou ? `<span class="t-ico r">${t === 'DIGITOVER' ? '&gt;2' : '&lt;7'}</span>` : `<span class="t-ico ${bot === 'rf1h' ? 'h' : 'r'}">${t === 'CALL' ? I.up : I.down}</span>`;
  const title = mult ? `${t === 'MULTUP' ? 'Up' : 'Down'} ×${esc(h.mult || '')}` : diff ? `Differs ${esc(h.barrier)}` : ou ? `${t === 'DIGITOVER' ? 'Over 2' : 'Under 7'}${h.step ? ' · step ' + h.step : ''}` : `${t === 'CALL' ? 'Rise' : t === 'PUT' ? 'Fall' : esc(t)}${h.step ? ' · step ' + h.step : ''}`;
  const tags = (h.mode === 'real' ? '<span class="tag real">REAL</span>' : '') + (bot === 'rf1h' ? '<span class="tag">1H</span>' : '') + (h.capped ? '<span class="tag cap">CAPPED</span>' : '') + (h.chain_end === 'bust' ? '<span class="tag bust">CHAIN LOST</span>' : '');
  const mins = h.settled_t && h.t ? Math.max(1, Math.round((h.settled_t - h.t) / 60)) : null;
  const dur = mult ? (mins ? ` · ${mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm'}` : '') : diff || ou ? ' · 1 tick' : bot === 'rf1h' ? ' · 1 hour' : '';
  return `<li${fresh ? ' class="new"' : ''}>${ico}<div class="t-main"><b>${title}${tags}</b><small>${fmtT(h.t)} · $${(+h.stake).toFixed(2)}${dur}</small></div><div class="amt ${set ? cls(h.profit) : 'muted'}">${set ? money(h.profit, true) : h.status === 'open' ? 'Open' : esc(h.status)}<small>${set ? (h.profit > 0 ? 'won' : 'lost') : ''}</small></div></li>`;
}

/* ---------- stats ---------- */
function meter(v, be) { const w = v == null ? 0 : Math.max(0, Math.min(100, v * 100)); const ok = v != null && be != null && v >= be;
  return `<div class="meter"><i class="${v == null ? '' : ok ? 'ok' : 'bad'}" style="width:${w}%"></i>${be != null ? `<em style="left:${be * 100}%"></em>` : ''}</div>`; }
const stepRows = (rows, be) => rows.length ? rows.map(x => `<div class="row"><div class="l"><b>${x.step ? 'Step ' + x.step : 'Base'}</b><small>${x.n} trades · ${x.wins}–${x.losses}</small></div><div style="flex:1;max-width:130px">${meter(x.winrate, be)}</div><div class="r">${pct(x.winrate, 0)}<small class="${cls(x.pnl)}">${money(x.pnl, true)}</small></div></div>`).join('') : '<p class="empty">No trades yet</p>';
function hoursCard(byHour) { const hrs = Array(24).fill(null); for (const h of byHour) hrs[h.hour] = h; const mx = Math.max(0.01, ...byHour.map(h => Math.abs(h.pnl)));
  return `<div class="card"><div class="card-h"><h3>P/L by hour</h3></div>
    <div class="hours">${hrs.map(h => { const v = h ? h.pnl : 0, hh = Math.abs(v) / mx * 50; return `<div class="hb" title="${h ? h.hour + ':00 ' + money(v, true) : ''}">${v > 0 ? `<i class="p" style="height:${hh}%"></i>` : v < 0 ? `<i class="n" style="height:${hh}%"></i>` : ''}</div>`; }).join('')}</div>
    <div class="hours-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></div>`; }
const daysCard = byDay => `<div class="card"><div class="card-h"><h3>Days</h3></div>${byDay.length ? byDay.slice(0, 10).map(x => `<div class="row"><div class="l"><b>${new Date(x.day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</b><small>${x.n} trades · ${pct(x.winrate, 0)} won</small></div><div class="r ${cls(x.pnl)}">${money(x.pnl, true)}</div></div>`).join('') : '<p class="empty">No days yet</p>'}</div>`;
function renderStats() {
  const s0 = R.stats, el = $('statsBody'); if (!s0 || !s0.mult) { el.innerHTML = '<div class="card"><p class="muted">Loading…</p></div>'; return; }
  const s = s0.mult, a = s.all, p = (R.st && R.st.mult && R.st.mult.params) || {}; const be = p.m_tp && p.m_sl ? +p.m_sl / (+p.m_tp + +p.m_sl) : 0.5;
  const dirRow = (n, x) => `<div class="row"><div class="l"><b>${n}</b><small>${x.n} trades · ${x.wins}–${x.losses}</small></div><div style="flex:1;max-width:130px">${meter(x.winrate, be)}</div><div class="r">${pct(x.winrate, 0)}<small class="${cls(x.pnl)}">${money(x.pnl, true)}</small></div></div>`;
  el.innerHTML = `
  <div class="st-grid">
    <div class="st"><span class="eyebrow">Win rate</span><div class="st-num">${pct(a.winrate)}</div>${meter(a.winrate, be)}<small>${a.n} trades · needs ${pct(be, 0)}+</small></div>
    <div class="st"><span class="eyebrow">P/L</span><div class="st-num ${cls(a.pnl)}">${money(a.pnl, true)}</div><small>all Multiplier trades</small></div>
    <div class="st"><span class="eyebrow">Avg win / loss</span><div class="st-num"><span class="up">${money(a.avg_win, true)}</span></div><small>loss ${money(a.avg_loss, true)}</small></div>
    <div class="st"><span class="eyebrow">Avg time</span><div class="st-num">${a.avg_mins == null ? '—' : a.avg_mins + 'm'}</div><small>per trade</small></div>
  </div>
  ${sesCard()}
  <div class="card" style="margin-top:14px"><div class="card-h"><h3>Direction</h3></div>${a.n ? dirRow('Up', s.up) + dirRow('Down', s.down) : '<p class="empty">No trades yet</p>'}</div>
  ${s.by_conf && s.by_conf.length ? `<div class="card"><div class="card-h"><h3>By agreement</h3></div>${s.by_conf.map(x => dirRow(x.key, x)).join('')}</div>` : ''}
  ${s.by_symbol && s.by_symbol.length > 1 ? `<div class="card"><div class="card-h"><h3>By market</h3></div>${s.by_symbol.map(x => dirRow(((R.st.mult.symbols || {})[x.key] || {}).short || x.key, x)).join('')}</div>` : ''}
  ${(() => { const lt = (R.st && R.st.real) || {}; return `<div class="card"><div class="card-h"><h3>Real lifetime</h3></div>
    <div class="row"><div class="l"><b>Real P/L</b><small>${lt.lifetime_trades || 0} real trades</small></div><div class="r ${cls(lt.lifetime_pnl)}">${money(lt.lifetime_pnl, true)}</div></div>
    ${capOn(lt) ? `<div class="row"><div class="l"><b>Loss cap</b><small>${money(lt.room_left)} left</small></div><div class="r">${money(lt.lifetime_cap)}</div></div>` : ''}</div>`; })()}
  ${hoursCard((s.by_hour || []).map(x => Object.assign({ hour: +x.key }, x)))}
  ${daysCard((s.by_day || []).map(x => Object.assign({ day: x.key }, x)))}`;
}
function sesCard() { const ss = R.st && R.st.mult && R.st.mult.sessions; if (!ss || !ss.on) return '';
  const end = e => e === 'tp' ? 'Take-profit' : e === 'sl' ? 'Stop' : 'Day limit';
  return `<div class="card" style="margin-top:14px"><div class="card-h"><h3>Sessions today</h3><span class="muted">${ss.done}/${ss.count}</span></div>${ss.log.length ? ss.log.map(x => `<div class="row"><div class="l"><b>Session ${x.n}</b><small>${x.trades} trades · ${end(x.end)} · ${fmtT(x.t).slice(0, 5)}</small></div><div class="r ${cls(x.pnl)}">${money(x.pnl, true)}</div></div>`).join('') : '<p class="empty">No sessions finished yet</p>'}</div>`; }

/* ---------- history ---------- */
const rowBot = h => h.bot_id || (h.strategy === 'rf1h' ? 'rf1h' : 'ats');
function histRows() { const rows = (R.hist && R.hist.rows) || []; return rows.filter(h => rowBot(h) === 'ats').slice().reverse(); }
function renderHistory() { const rows = histRows();
  $('histList').innerHTML = rows.length ? rows.slice(0, 200).map(h => tradeRow({ t: h.t, id: h.contract_id, bot_id: rowBot(h), phase: h.phase, step: h.step, type: h.contract_type, barrier: h.barrier, stake: h.stake, profit: h.profit, status: h.status, mode: h.mode, capped: h.capped, chain_end: h.chain_end, mult: h.mult, settled_t: h.settled_t })).join('') : '<li class="empty">No trades here yet</li>'; }
$('exportBtn').onclick = () => { const rows = histRows().slice().reverse(); const cols = ['t', 'contract_id', 'bot', 'mode', 'symbol', 'contract_type', 'mult', 'stake', 'tp', 'sl', 'conf', 'entry_spot', 'exit_spot', 'profit', 'status', 'why'];
  const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => { const v = c === 't' ? new Date(r.t * 1000).toISOString() : c === 'bot' ? rowBot(r) : r[c]; return v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v; }).join(','))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'ats-history.csv'; a.click(); };

/* ---------- settings ---------- */
let draft = null, gdraft = null, dirty = false;
const F = [ // [key, label, hint, type, unit, step, icon class, icon, sessions-only]
  ['g', 'Market', [['m_symbol', 'Market', '', 'sym', '', 0, 'c1', I.layers], ['m_mult', 'Multiplier', '', 'mult', '', 0, 'c1', I.zap]]],
  ['g', 'Trade', [['m_stake', 'Stake', '', 'n', '$', 0.5, 'c1', I.wallet], ['m_tp', 'Take profit', '', 'n', '$', 0.1, 'c3', I.target], ['m_sl', 'Stop loss', '', 'n', '$', 0.1, 'c4', I.shield], ['m_conf', 'Signal agreement', '', 'n', '%', 1, 'c2', I.check], ['m_maxmin', 'Max trade time', '0 = off', 'n', 'min', 5, 'c2', I.clock]]],
  ['g', 'Martingale', [['m_mg', 'Martingale', '', 'b', '', 0, 'c2', I.zap], ['m_mg_factor', 'Factor', '', 'n', '×', 0.1, 'c2', I.zap, 0, 1], ['m_mg_steps', 'Steps', '', 'n', '', 1, 'c2', I.layers, 0, 1], ['smart_mg', 'Smart stop-loss cap', '', 'b', '', 0, 'c2', I.shield]]],
  ['g', 'Sessions', [['ses_on', 'Sessions', '', 'b', '', 0, 'c1', I.layers], ['ses_count', 'Sessions per day', '', 'n', '', 1, 'c1', I.layers, 1], ['ses_tp', 'Session target', '', 'n', '$', 0.1, 'c3', I.target, 1], ['ses_sl', 'Session stop', '', 'n', '$', 0.5, 'c4', I.shield, 1], ['ses_pause', 'Pause between', '', 'n', 's', 10, 'c1', I.clock, 1]]],
  ['g', 'Daily limits', [['day_tp', 'Daily lock', '', 'n', '$', 0.5, 'c3', I.lock], ['day_sl', 'Daily stop', '', 'n', '$', 0.5, 'c4', I.shield]]],
  ['g', 'Safety', [['m_max_losses', 'Max losses in a row', '', 'n', '', 1, 'c5', I.x], ['max_stake', 'Max stake', '', 'n', '$', 0.5, 'c5', I.wallet]]],
];
let SYMS = {};
const SELECTS = { side: (H && H.REC_SIDES) || [['auto', 'Auto'], ['over', 'Over 2'], ['under', 'Under 7']],
  get sym() { return Object.entries(SYMS).map(([k, v]) => [k, v.short]); },
  get mult() { const si = SYMS[draft && draft.m_symbol] || { mults: [] }; return si.mults.map(m => [m, '×' + m]); } };
function fieldHtml(obj, [k, label, hint, type, unit, step, ic, icon]) {
  const v = obj[k]; let ctl;
  if (type === 'b') ctl = `<label class="switch"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}><span></span></label>`;
  else if (SELECTS[type]) ctl = `<select data-k="${k}"${type === 'mult' ? ' data-num="1"' : ''}>${SELECTS[type].map(o => `<option value="${o[0]}"${String(o[0]) === String(v) ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`;
  else ctl = `${unit === '$' ? '<span class="unit">$</span>' : ''}<input type="number" inputmode="decimal" step="${step}" data-k="${k}" value="${v}">${unit && unit !== '$' ? `<span class="unit" style="margin:0">${unit}</span>` : ''}`;
  return `<div class="item"><span class="ic ${ic}">${icon}</span><div class="lab"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</div>${ctl}</div>`; }
function renderSettings() {
  if (view !== 'settings') return; const st = R.st, el = $('setBody');
  if (!st) { el.innerHTML = '<div class="card"><p class="muted">Connect your server first.</p></div>'; return; }
  SYMS = (st.mult && st.mult.symbols) || SYMS;
  if (!draft || !dirty) { draft = Object.assign({}, st.mult ? st.mult.params : {}, st.bot.params); gdraft = Object.assign({}, st.global); }
  const bx = botOf(st), on = bx.on, anyOn = st.bot.running || st.bot.open, real = st.real, pref = themePref();
  const obj = draft;
  // Safety: the run-level session stop/take-profit are not used in sessions mode
  const groups = F.map(([g, t, fs]) => [g, t, fs.filter(f => !(f[8] && !obj.ses_on) && !(f[9] && !obj.m_mg))]);
  el.innerHTML = `
  ${on ? `<div class="notice">${I.info}<span>Stop ${bx.name} to change its settings.</span></div>` : ''}
  ${groups.map(([, t, fs]) => `<div class="group"><div class="group-t">${t}</div><div class="list" data-bot-list>${fs.map(f => fieldHtml(obj, f)).join('')}</div></div>`).join('')}
  <div class="group"><div class="group-t">Account limits</div><div class="list">
    <div class="item"><span class="ic c4">${I.shield}</span><div class="lab"><b>Stop at loss</b></div><span class="unit">$</span><input type="number" inputmode="decimal" step="0.5" data-g="sl" value="${gdraft.sl}"></div>
    <div class="item"><span class="ic c3">${I.target}</span><div class="lab"><b>Stop at profit</b></div><span class="unit">$</span><input type="number" inputmode="decimal" step="0.5" data-g="tp" value="${gdraft.tp}"></div></div>
    <p class="note" style="margin:8px 6px 0">${money(st.session.pnl, true)} · <button type="button" class="link" id="newSess"${anyOn ? ' disabled' : ''}>New session</button></p></div>
  <div class="group"><div class="group-t">Account</div><div class="list">
    <div class="item"><span class="ic ${isReal(st) ? 'c6' : 'c1'}">${I.wallet}</span><div class="lab"><b>${isReal(st) ? 'Real account' : 'Demo account'}</b><small>${esc(st.account.prefix || '')} · balance ${st.account.balance == null ? '—' : money(st.account.balance)}</small></div><button type="button" class="link" id="openAcct">Switch</button></div></div></div>
  <div class="group"><div class="group-t">Real money</div><div class="list">
    <div class="item"><span class="ic c6">${I.shield}</span><div class="lab"><b>Lifetime loss cap</b><small>${capOn(real) ? `${money(real.lifetime_lost)} lost · ${money(real.room_left)} left` : 'Off'}</small></div><label class="switch"><input type="checkbox" id="capOn"${capOn(real) ? ' checked' : ''}><span></span></label></div>
    ${capOn(real) ? `<div class="item"><span class="ic c6">${I.wallet}</span><div class="lab"><b>Cap amount</b></div><span class="unit">$</span><input type="number" inputmode="decimal" step="1" min="1" id="capIn" value="${real.lifetime_cap}"></div>` : ''}</div>
    <p class="note" style="margin:8px 6px 0">Real runs the ATS bot only.</p></div>
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
  el.querySelectorAll('[data-k]').forEach(inp => inp.oninput = inp.onchange = () => { const k = inp.dataset.k; obj[k] = inp.type === 'checkbox' ? inp.checked : inp.tagName === 'SELECT' ? (inp.dataset.num ? +inp.value : inp.value) : inp.value === '' ? '' : +inp.value;
    if (k === 'm_symbol' && SYMS[obj.m_symbol] && !SYMS[obj.m_symbol].mults.includes(+obj.m_mult)) obj.m_mult = SYMS[obj.m_symbol].mults[0];
    markDirty(); if (k === 'ses_on' || k === 'm_mg' || k === 'm_symbol') renderSettings(); });
  el.querySelectorAll('[data-g]').forEach(inp => inp.oninput = () => { gdraft[inp.dataset.g] = +inp.value; markDirty(); });
  el.querySelectorAll('[data-bot-list] input,[data-bot-list] select').forEach(x => { if (on) x.disabled = true; });
  el.querySelectorAll('#themeSeg button').forEach(b => b.onclick = () => setTheme(b.dataset.t));
  const q = id => el.querySelector('#' + id);
  if (q('saveSet')) q('saveSet').onclick = async () => { try {
    const g = st.global; if (gdraft.sl !== g.sl || gdraft.tp !== g.tp) await R.saveGlobal(gdraft);
    const same = (a, b) => Object.keys(a).every(k => a[k] === b[k]);
    const cur = Object.assign({}, st.mult ? st.mult.params : {}, st.bot.params); if (!same(draft, cur)) await R.saveParams(Object.assign({}, draft, { strategy: 'mult' }));
    dirty = false; toast({ level: 'win', title: 'Saved' }); renderSettings(); } catch (e) { errToast(e); } };
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
  if (!(await ask({ title: 'Switch to Real money?', text: 'The ATS bot will trade your real balance. Daily stop −$2 applies.', real: true, ok: 'Switch' }))) return;
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
function render() { renderHeader(); if (view === 'mt5') { if (window.ATSMT5) window.ATSMT5.render(); } else if (view === 'home') renderHome(); else if (view === 'stats') renderStats(); else if (view === 'history') renderHistory(); else renderSettings(); }
R.on(() => { pumpEvents(R.st); if (view === 'settings' && dirty) { renderHeader(); return; } if (view === 'settings' && document.activeElement && document.activeElement.closest && document.activeElement.closest('#setBody')) { renderHeader(); return; } render(); });
window.ATSApp = { go, toast, render, setTheme, openAccount, ask };
render(); R.kick();
})();
