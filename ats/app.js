/* ATS v4.14 app: remote control + dashboard. Bots: ATS Bot (server, demo), Rise and Fall (server), Even/Odd, Over/Under, Matches/Differs (server, demo) and the MT5 bot.
 * Views: Home, Bot detail, MT5, Stats, History, Settings.
 * Forms are built once and only patched while not focused or edited, so the status poll never replaces an input (iPhone keyboard stays open). */
(() => {
'use strict';
const APP_VER = '4.21.0';
(function watchUpdates() {
  if (!('serviceWorker' in navigator)) return;
  const show = () => { const bar = document.getElementById('updBar'); if (!bar || !bar.hidden) return; bar.hidden = false; bar.onclick = () => location.reload(); };
  let refreshing = false;
  if (navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener('controllerchange', () => { if (refreshing || formsBusy()) return; refreshing = true; location.reload(); });
  const track = reg => {
    const nudge = sw => { if (!sw) return; try { sw.postMessage('skipWaiting'); } catch (e) { } show(); };
    if (reg.waiting) nudge(reg.waiting);
    reg.addEventListener('updatefound', () => { const inst = reg.installing; if (!inst) return; inst.addEventListener('statechange', () => { if (inst.state === 'installed' && navigator.serviceWorker.controller) nudge(reg.waiting || inst); }); });
    const ping = () => reg.update().catch(() => { }); setInterval(ping, 60e3); document.addEventListener('visibilitychange', () => { if (!document.hidden) ping(); });
  };
  const start = () => navigator.serviceWorker.register('./sw.js?v=22', { scope: './' }).then(track).catch(() => { });
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
const R = window.ATSRemote;
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (x, sign) => x == null || isNaN(x) ? '—' : (sign && x > 0 ? '+' : x < 0 ? '−' : '') + '$' + Math.abs(+x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x, d = 1) => x == null ? '—' : (x * 100).toFixed(d) + '%';
const cls = x => x > 0 ? 'up' : x < 0 ? 'dn' : '';
const fmtT = (ep, withDay) => new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: 'Asia/Bahrain', hour: '2-digit', minute: '2-digit', second: withDay ? undefined : '2-digit', hour12: false }, withDay ? { day: 'numeric', month: 'short' } : {})).format(new Date(ep * 1000));
const hm = ep => fmtT(ep).slice(0, 5);
/** e.g. 'Running since Wed 25 Nov, 09:29' — no time-zone name. */
function sinceLine(ep) { if (!(+ep > 0)) return ''; const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bahrain', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ep * 1000)).forEach(x => { p[x.type] = x.value; });
  return 'Running since ' + p.weekday + ' ' + p.day + ' ' + p.month + ', ' + p.hour + ':' + p.minute; }
const sinceHtml = ep => { const s = sinceLine(ep); return s ? `<p class="muted small">${s}</p>` : ''; };
window.ATSSince = sinceHtml;
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>', down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>', x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>', lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 3.5l9 16.5H3z"/><path d="M12 10v4.5M12 17.5h.01"/></svg>', info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
};
const evIcon = l => ({ win: I.check, loss: I.x, error: I.alert, warn: I.swap, lock: I.lock, info: I.info }[l] || I.info);

/* ---------- bots ---------- */
const BOTS = [
  { id: 'atsbot', name: 'ATS Bot', mono: 'AB', kind: 'ab' },
  { id: 'ats', name: 'Rise and Fall', mono: 'RF', kind: 'rf' },
  { id: 'evenodd', name: 'Even/Odd', mono: 'EO', kind: 'dg' },
  { id: 'overunder', name: 'Over/Under', mono: 'OU', kind: 'dg' },
  { id: 'matchdiff', name: 'Matches/Differs', mono: 'MD', kind: 'dg' },
];
const BOT = Object.fromEntries(BOTS.map(b => [b.id, b]));
const SYMBOLS = [['1HZ10V', 'V10 (1s)'], ['1HZ25V', 'V25 (1s)'], ['1HZ50V', 'V50 (1s)'], ['1HZ75V', 'V75 (1s)'], ['1HZ100V', 'V100 (1s)'], ['R_10', 'V10'], ['R_25', 'V25'], ['R_50', 'V50'], ['R_75', 'V75'], ['R_100', 'V100'], ['JD10', 'Jump 10'], ['JD25', 'Jump 25'], ['JD50', 'Jump 50'], ['JD75', 'Jump 75'], ['RDBULL', 'Bull Market'], ['RDBEAR', 'Bear Market']];
const symShort = s => (SYMBOLS.find(x => x[0] === s) || [s, s])[1];
const sideLabel = (t, b) => ({ CALL: 'Rise', PUT: 'Fall', DIGITEVEN: 'Even', DIGITODD: 'Odd', DIGITOVER: 'Over ' + b, DIGITUNDER: 'Under ' + b, DIGITMATCH: 'Matches ' + b, DIGITDIFF: 'Differs ' + b, MULTUP: 'Up', MULTDOWN: 'Down' }[t] || t);
const rowBot = h => h.bot_id || (h.strategy === 'rf1h' ? 'rf1h' : 'ats');
const isReal = st => !!(st && st.mode === 'real');
const capOn = real => !!(real && +real.lifetime_cap > 0);
/** One shape for every server bot from /api/status. */
function botOf(st, id) {
  if (id === 'ats') { const v = st.classic || {}, b = st.bot, p = v.params || {};
    return { id, name: 'Rise and Fall', mono: 'RF', running: b.running, open: b.open, on: !!(b.running || b.open), state: b.state, msg: b.msg, halt: b.halt_reason, day: v.day || {}, ses: v.sessions, params: p, next: v.next,
      step: v.step || 0, recent: v.recent || [], stats: v.stats || {}, pos: v.position, signal: v.signal, skip: v.last_skip, view: v, started_at: b.started_at || v.started_at,
      market: `V25 (1s) · ${p.cycle === 'ticks' ? p.ticks + ' ticks' : (p.cycle || '5m') + ' candles'}`, contract: 'Rise / Fall' }; }
  const v = (st.bots || {})[id]; if (!v) return null; const p = v.effective || v.params || {};
  if (id === 'atsbot') { const ab = v.ab || { run: {}, today: {} };
    return { id, name: 'ATS Bot', mono: 'AB', running: v.running, open: v.open, on: v.on, state: v.state, msg: v.msg, halt: v.halt_reason, day: v.day || {}, params: p, next: v.next, step: v.step || 0,
      recent: v.recent || [], stats: v.stats || {}, pos: v.position, view: v, ab, outcome: ab.outcome || 'idle', started_at: v.started_at || (ab.run && ab.run.started_at), market: `target ${money(+p.target || 0)}`, contract: 'Auto trading' }; }
  const contract = id === 'evenodd' ? (p.side === 'both' ? 'Even or Odd' : p.side === 'even' ? 'Even' : 'Odd') : id === 'overunder' ? (p.side === 'both' ? `Over ${p.over_digit} or Under ${p.under_digit}` : p.side === 'over' ? `Over ${p.over_digit}` : `Under ${p.under_digit}`) : (p.side === 'match' ? 'Matches' : 'Differs') + (p.digit_src === 'user' ? ' ' + p.digit : p.digit_src === 'random' ? ' · random digit' : ' · market digit');
  return { id, name: v.name, mono: BOT[id].mono, running: v.running, open: v.open, on: v.on, state: v.state, msg: v.msg, halt: v.halt_reason, day: v.day || {}, ses: v.sessions, params: p, next: v.next, step: v.step || 0,
    recent: v.recent || [], stats: v.stats || {}, pos: v.position, analysis: v.analysis, view: v, mgFactor: v.mg_factor, ratio: v.payout_ratio, started_at: v.started_at,
    market: `${symShort(p.symbol)} · ${p.ticks} tick${+p.ticks === 1 ? '' : 's'}`, contract };
}
const allBots = st => BOTS.map(b => botOf(st, b.id)).filter(Boolean);
function stateChip(x) { if (x.id === 'atsbot') return abChip(x); const ds = x.day && x.day.state;
  return ds === 'locked' && x.on ? ['ok', 'Goal locked'] : ds === 'stopped' && x.on ? ['bad', 'Day stopped'] : x.on ? (x.running ? ['live', 'Running'] : ['warn', 'Stopping']) : x.state === 'halted' ? ['bad', 'Halted'] : ['', 'Stopped']; }

/* ---------- theme ---------- */
const mq = matchMedia('(prefers-color-scheme: dark)');
const themePref = () => { try { return localStorage.getItem('ats.theme2') || 'auto'; } catch (e) { return 'auto'; } };
function applyTheme() { const p = themePref(); const dark = p === 'dark' || (p === 'auto' && mq.matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', dark ? '#0a0b0e' : '#f4f5f7')); }
function setTheme(p) { try { localStorage.setItem('ats.theme2', p); } catch (e) { } applyTheme(); document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === p)); }
mq.addEventListener ? mq.addEventListener('change', applyTheme) : mq.addListener(applyTheme); applyTheme();

/* ---------- toasts ---------- */
let lastEv = null, lastToastKey = '', lastToastAt = 0, toastTimer = null;
function dismissToasts(immediate) { const box = $('toasts'); if (!box) return; clearTimeout(toastTimer); toastTimer = null;
  [...box.children].forEach(el => { if (immediate) { el.remove(); return; } if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 320); }); }
function toast(o) { if (typeof o === 'string') o = { level: 'info', title: o };
  const box = $('toasts'); if (!box) return; const key = (o.level || 'info') + '|' + (o.title || '') + '|' + (o.text || '');
  if (key === lastToastKey && Date.now() - lastToastAt < 1600) return; lastToastKey = key; lastToastAt = Date.now(); dismissToasts(true);
  const el = document.createElement('div'); el.className = 'toast ' + (o.level || 'info'); el.setAttribute('role', 'status');
  el.innerHTML = `<span class="ti">${evIcon(o.level)}</span><span class="tt"><b>${esc(o.title)}</b>${o.text ? `<small>${esc(o.text)}</small>` : ''}</span>${o.t ? `<time>${hm(o.t)}</time>` : ''}<button type="button" class="toast-x" aria-label="Dismiss">${I.x}</button>`;
  const kill = ev => { if (ev) ev.stopPropagation(); if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 320); };
  el.onclick = kill; el.querySelector('.toast-x').onclick = kill;
  box.appendChild(el); toastTimer = setTimeout(kill, o.ms || (o.level === 'error' ? 6500 : 4200)); }
const errToast = e => toast({ level: 'error', title: (e && e.message) || String(e) });
function catchUpEvents(st) { const evs = (st && st.events) || []; if (evs.length) lastEv = evs[evs.length - 1].id; }
function pumpEvents(st) { const evs = (st && st.events) || []; const top = evs.length ? evs[evs.length - 1].id : 0;
  if (lastEv == null) { lastEv = top; return; }
  const fresh = evs.filter(e => e.id > lastEv && !e.quiet); if (top > lastEv) lastEv = top; if (!fresh.length) return;
  toast([...fresh].reverse().find(e => e.level === 'error' || e.level === 'lock' || e.level === 'warn') || fresh[fresh.length - 1]); }

/* ---------- sheets ---------- */
function sheet(html, onMount) { dismissToasts(true); const w = $('sheetWrap'), s = $('sheet'); s.innerHTML = html; w.hidden = false; $('sheetBg').onclick = closeSheet; if (onMount) onMount(s); }
function closeSheet() { $('sheetWrap').hidden = true; $('sheet').innerHTML = ''; }
function ask({ title, text, ok = 'Continue', danger, real, html }) { return new Promise(res => {
  sheet(`<h2${real ? ' class="real-h"' : ''}>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${html || ''}<div class="btns"><button type="button" class="btn ${real ? 'real' : danger ? 'danger' : 'primary'} block" id="askOk">${esc(ok)}</button><button type="button" class="btn ghost block" id="askNo">Cancel</button></div>`, s => {
    s.querySelector('#askOk').onclick = () => { closeSheet(); res(true); }; s.querySelector('#askNo').onclick = () => { closeSheet(); res(false); }; });
  $('sheetBg').onclick = () => { closeSheet(); res(false); }; }); }
const info = (title, text) => sheet(`<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}<div class="btns"><button type="button" class="btn ghost block" id="ok">OK</button></div>`, s => { s.querySelector('#ok').onclick = closeSheet; });

/* ---------- forms: built once, patched only while not focused or edited ---------- */
const FORMS = new Set();
function formsBusy() { for (const f of FORMS) if (f.busy()) return true; return false; }
class FormCtl {
  /** schema: [{ title, fields: [{ k, label, type: 'n'|'i'|'b'|'sel'|'s', unit, opts, show(draft), hint }] }] */
  constructor(el, schema, values, opts = {}) { this.el = el; this.schema = schema; this.opts = opts; this.base = Object.assign({}, values); this.draft = Object.assign({}, values); this.dirty = false; this.disabled = null; this.build(); FORMS.add(this); }
  fields() { return this.schema.flatMap(g => g.fields).filter(f => f.type !== 'note'); }
  rows() { return this.schema.flatMap(g => g.fields); }
  ctl(f) { const v = this.draft[f.k], id = `${this.opts.prefix || 'f'}_${f.k}`;
    if (f.type === 'b') return `<label class="switch"><input type="checkbox" id="${id}" data-k="${f.k}"${v === true || v === 1 || v === '1' || v === 'true' ? ' checked' : ''}><span></span></label>`;
    if (f.type === 'sel') return `<select id="${id}" data-k="${f.k}">${(typeof f.opts === 'function' ? f.opts(this.draft) : f.opts).map(o => `<option value="${esc(o[0])}"${String(o[0]) === String(v) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    const num = f.type === 'n' || f.type === 'i';
    return `<span class="inp${num ? '' : ' wide'}">${f.unit === '$' ? '<i>$</i>' : ''}<input id="${id}" type="text" ${num ? `inputmode="${f.type === 'i' ? 'numeric' : 'decimal'}"` : 'autocapitalize="off"'} autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" data-k="${f.k}" value="${esc(v == null ? '' : v)}">${f.unit && f.unit !== '$' ? `<i>${esc(f.unit)}</i>` : ''}</span>`; }
  build() {
    this.el.innerHTML = this.schema.map(g => `<fieldset class="fgroup"><legend>${esc(g.title)}</legend>${g.fields.map(f => f.type === 'note' ? `<div class="frow" data-row="${f.k}"><p class="muted small" style="margin:0">${esc(f.hint)}</p></div>` : `<div class="frow" data-row="${f.k}"><label for="${this.opts.prefix || 'f'}_${f.k}"><b>${esc(f.label)}</b>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>${this.ctl(f)}</div>`).join('')}</fieldset>`).join('');
    this.el.querySelectorAll('[data-k]').forEach(inp => { const f = this.fields().find(x => x.k === inp.dataset.k);
      const read = () => { const raw = inp.type === 'checkbox' ? inp.checked : inp.value;
        this.draft[f.k] = f.type === 'b' ? !!raw : (f.type === 'n' || f.type === 'i') ? (String(raw).trim() === '' ? '' : +String(raw).replace(',', '.')) : (f.num ? +raw : raw);
        inp.dataset.edited = '1'; if (!this.dirty) { this.dirty = true; } this.applyShow(); if (this.opts.onChange) this.opts.onChange(this, f.k); };
      inp.addEventListener('input', read); inp.addEventListener('change', read);
      if (inp.tagName === 'INPUT' && inp.type === 'text') inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); }); });
    this.applyShow();
  }
  applyShow() { for (const f of this.rows()) if (f.show) { const row = this.el.querySelector(`[data-row="${f.k}"]`); const vis = !!f.show(this.draft); if (row && row.hidden === vis) row.hidden = !vis; } }
  /** New server values: update only inputs that are not focused, and nothing at all while there are unsaved edits. */
  patch(values) { this.base = Object.assign({}, values); if (this.dirty) return;
    const act = document.activeElement; this.draft = Object.assign({}, values);
    this.el.querySelectorAll('[data-k]').forEach(inp => { if (inp === act) return; const v = this.draft[inp.dataset.k];
      if (inp.type === 'checkbox') { const c = v === true || v === 1 || v === '1' || v === 'true'; if (inp.checked !== c) inp.checked = c; }
      else { const s = v == null ? '' : String(v); if (inp.value !== s) inp.value = s; } });
    this.applyShow(); }
  setDisabled(d) { d = !!d; if (this.disabled === d) return; this.disabled = d; this.el.querySelectorAll('[data-k]').forEach(i => { i.disabled = d; }); }
  discard() { this.dirty = false; this.el.querySelectorAll('[data-edited]').forEach(i => delete i.dataset.edited); const act = document.activeElement; if (act && this.el.contains(act)) act.blur(); this.patch(this.base); }
  saved(values) { this.dirty = false; this.el.querySelectorAll('[data-edited]').forEach(i => delete i.dataset.edited); this.patch(values); }
  busy() { return this.dirty || (document.activeElement && this.el.contains(document.activeElement)); }
  changes() { const out = {}; for (const f of this.fields()) if (String(this.draft[f.k]) !== String(this.base[f.k])) out[f.k] = this.draft[f.k]; return out; }
  destroy() { FORMS.delete(this); }
}
window.ATSForm = FormCtl;

/* ---------- settings schemas ---------- */
const sw = (k, label, hint, show) => ({ k, label, type: 'b', hint, show });
const nm = (k, label, unit, hint, show) => ({ k, label, type: 'n', unit, hint, show });
const it = (k, label, unit, hint, show) => ({ k, label, type: 'i', unit, hint, show });
const mgOn = d => !!d.martingale, sesOn = d => !!d.ses_on;
const RF_DIRS = [['analysis', 'Our analysis'], ['topdown', 'Top-down zones']];
const RF_SCHEMA = [
  { title: 'Trade', fields: [nm('stake', 'Stake', '$'), { k: 'direction', label: 'Direction', type: 'sel', opts: d => RF_DIRS.concat(RF_DIRS.some(o => o[0] === d.direction) ? [] : [[d.direction, d.direction]]) },
    { k: 'cycle', label: 'Candle', type: 'sel', opts: [['1m', '1 minute'], ['5m', '5 minutes'], ['15m', '15 minutes'], ['30m', '30 minutes'], ['1h', '1 hour']] },
    { k: 'td_setup', label: 'Setup', type: 'sel', opts: [['zones', 'Zones'], ['retest', 'Break & retest'], ['fib', 'Retest + Fib'], ['score', 'Confluence score']], show: d => d.direction === 'topdown' },
    { k: 'td_note', label: 'Top-down zones', type: 'note', hint: 'Trades only when price is at a strong zone edge with a 1-minute confirmation; otherwise it skips. Any minute, contract runs for the candle. Backtest: 15 minutes was best, 55.7% on unseen data (break-even 53.2% at $0.35), about 4 trades a day. Not a proven edge.', show: d => d.direction === 'topdown' && (d.td_setup || 'zones') === 'zones' },
    { k: 'td_note2', label: 'Setup', type: 'note', hint: 'H1 break, pullback into the flipped zone, 1-minute rejection. Backtest Jul–Nov: about 50% at every expiry (break-even 53.2%). Not a proven edge.', show: d => d.direction === 'topdown' && (d.td_setup === 'retest' || d.td_setup === 'fib') },
    { k: 'td_note3', label: 'Setup', type: 'note', hint: 'Points for zone, flip, break, sweep and candle pattern; trades at 4+ after a 1-minute rejection. Backtest on unseen data: 51.5% at 15 minutes (break-even 53.2%). Not a proven edge.', show: d => d.direction === 'topdown' && d.td_setup === 'score' }] },
  { title: 'Martingale', fields: [sw('martingale', 'Martingale'), nm('mg_factor', 'Factor', '×', '', mgOn), it('mg_max_steps', 'Steps', '', '', mgOn), sw('mg_reset_win', 'Reset on a win', '', mgOn)] },
  { title: 'Sessions', fields: [sw('ses_on', 'Sessions'), it('ses_count', 'Sessions per day', '', '', sesOn), nm('ses_tp', 'Session target', '$', '', sesOn), nm('ses_sl', 'Session stop', '$', '', sesOn), it('ses_pause', 'Pause between', 's', '', sesOn)] },
  { title: 'Daily limits', fields: [nm('day_tp', 'Daily lock', '$'), nm('day_sl', 'Daily stop', '$'), it('max_consec_losses', 'Max losses in a row')] },
];
const MG_MODES = { evenodd: [['fixed', 'Factor'], ['payout', 'From payout']], overunder: [['digit', 'Auto (per digit)'], ['fixed', 'Factor'], ['payout', 'From payout']], matchdiff: [['side', 'Auto (×1.1 / ×11)'], ['fixed', 'Factor'], ['payout', 'From payout']] };
function dgSchema(id) {
  const side = { evenodd: [['both', 'Both'], ['even', 'Even'], ['odd', 'Odd']], overunder: [['both', 'Both'], ['over', 'Over'], ['under', 'Under']], matchdiff: [['differ', 'Differs'], ['match', 'Matches']] }[id];
  const digits = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => [a + i, String(a + i)]);
  const trade = [{ k: 'symbol', label: 'Market', type: 'sel', opts: SYMBOLS }, { k: 'side', label: 'Trade type', type: 'sel', opts: side }];
  if (id === 'overunder') trade.push({ k: 'over_digit', label: 'Over digit', type: 'sel', num: true, opts: digits(0, 8) }, { k: 'under_digit', label: 'Under digit', type: 'sel', num: true, opts: digits(1, 9) });
  if (id === 'matchdiff') trade.push({ k: 'digit_src', label: 'Digit', type: 'sel', opts: [['market', 'From the market'], ['user', 'My digit'], ['random', 'Random']] }, { k: 'digit', label: 'My digit', type: 'sel', num: true, opts: digits(0, 9), show: d => d.digit_src === 'user' });
  trade.push(sw('signal', 'Use signal'), { k: 'scan', label: 'Signal markets', type: 'sel', opts: [['all', 'All markets'], ['one', 'This market']], show: d => !!d.signal }, it('lookback', 'Ticks to analyze'), it('ticks', 'Duration', 'ticks'), nm('stake', 'Stake', '$'));
  return [
    { title: 'Trade', fields: trade },
    { title: 'Martingale', fields: [sw('martingale', 'Martingale'), { k: 'mg_mode', label: 'Multiplier', type: 'sel', opts: MG_MODES[id], show: mgOn }, nm('mg_factor', 'Factor', '×', '', d => d.martingale && d.mg_mode === 'fixed'), it('mg_max_steps', 'Steps', '', '', mgOn), sw('mg_reset_win', 'Reset on a win', '', mgOn), sw('smart_mg', 'Smart cap', '', mgOn)] },
    { title: 'Sessions', fields: [sw('ses_on', 'Sessions'), it('ses_count', 'Sessions per day', '', '', sesOn), nm('ses_tp', 'Session target', '$', '', sesOn), nm('ses_sl', 'Session stop', '$', '', sesOn), it('ses_pause', 'Pause between', 's', '', sesOn)] },
    { title: 'Daily limits', fields: [nm('day_tp', 'Daily lock', '$'), nm('day_sl', 'Daily stop', '$'), it('max_consec_losses', 'Max losses in a row'), nm('gap', 'Gap between trades', 's')] },
  ];
}

/* ---------- navigation ---------- */
let view = 'home', botId = 'ats';
const VIEWS = ['home', 'bot', 'ab', 'mt5', 'stats', 'history', 'settings'];
function go(v, arg) { if (v === 'bot' && arg) botId = arg; if (v === 'bot' && botId === 'atsbot') v = 'ab'; else if (v === 'ab') botId = 'atsbot'; view = v; if (window.ATSMT5) window.ATSMT5.show(v === 'mt5', v === 'home');
  for (const x of VIEWS) { const el = $('v-' + x); if (el) el.hidden = x !== v; }
  const tab = v === 'bot' || v === 'ab' ? 'home' : v; document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.go === tab));
  R.wantHist = v === 'history' ? histBot : v === 'bot' || v === 'ab' ? null : R.wantHist;
  if (v === 'history') R.refresh(true).catch(() => { });
  window.scrollTo({ top: 0 }); render(); }
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));

/* ---------- header ---------- */
function renderHeader() { const st = R.st; const anyOn = st && allBots(st).some(x => x.on);
  const badge = $('modeBadge'); badge.className = 'badge ' + (!st ? 'off' : isReal(st) ? 'real' : '');
  $('modeTxt').textContent = !st ? (R.hasKey() ? (R.err ? 'OFFLINE' : 'CONNECTING') : 'NOT PAIRED') : isReal(st) ? 'REAL' : 'DEMO';
  $('liveDot').className = 'live-dot' + (anyOn ? ' on' : '');
  const nRun = st ? runningNames(st).length : 0; $('stopTop').hidden = nRun < 1; $('stopTop').disabled = R.busy;
  const bal = st && st.account && st.account.balance; $('acctBal').textContent = bal == null ? '—' : money(bal);
  document.documentElement.classList.toggle('is-real', isReal(st));
  $('realStrip').hidden = !isReal(st);
  if (st && st.real) $('realStripTxt').textContent = 'Real money' + (capOn(st.real) ? ` · cap ${money(st.real.lifetime_cap)} (${money(st.real.room_left)} left)` : '');
  const hm_ = $('heroMode'); hm_.textContent = !st ? (R.err ? 'Offline' : 'Connecting') : isReal(st) ? 'Real' : 'Demo'; hm_.className = 'mode-tag' + (isReal(st) ? ' real' : !st ? ' off' : ''); hm_.hidden = !!st && !isReal(st); }

/* ---------- home ---------- */
const NAME_KEY = 'ats.name';
function accountName() { try { const n = localStorage.getItem(NAME_KEY); if (n) return n; } catch (e) { } return 'Trader'; }
function editName() { const cur = accountName();
  sheet(`<h2>Your name</h2><p>Shown on the welcome screen. Stored only on this device.</p><input class="field" id="nmIn" maxlength="40" autocomplete="off" value="${esc(cur === 'Trader' ? '' : cur)}" placeholder="Name"><div class="btns"><button type="button" class="btn primary block" id="nmOk">Save</button><button type="button" class="btn ghost block" id="nmNo">Cancel</button></div>`, s => {
    const i = s.querySelector('#nmIn'); setTimeout(() => i.focus(), 50);
    const save = () => { const n = i.value.trim(); try { n ? localStorage.setItem(NAME_KEY, n.slice(0, 40)) : localStorage.removeItem(NAME_KEY); } catch (e) { } $('atsName').textContent = accountName(); closeSheet(); };
    s.querySelector('#nmOk').onclick = save; i.onkeydown = e => { if (e.key === 'Enter') save(); }; s.querySelector('#nmNo').onclick = closeSheet; }); }
$('atsNameEdit').onclick = editName;
/** Day bar: stop on the left, lock on the right, fill from $0. */
function dayBar(pnl, stop, lock) { stop = Math.max(0.01, +stop || 1); lock = Math.max(0.01, +lock || 1); const z = stop / (stop + lock) * 100, pn = +pnl || 0;
  const w = pn >= 0 ? Math.min(1, pn / lock) * (100 - z) : Math.min(1, -pn / stop) * z, l = pn >= 0 ? z : z - w;
  return `<div class="dbar" title="Daily stop −$${stop.toFixed(2)} · lock +$${lock.toFixed(2)}"><i class="z" style="left:${z}%"></i><i class="f ${pn >= 0 ? 'p' : 'n'}" style="left:${l}%;width:${w}%"></i></div><div class="dbar-l"><span>−$${stop.toFixed(2)}</span><span>+$${lock.toFixed(2)}</span></div>`; }
function sesDots(ss, ds) { if (!ss || !ss.on || !ss.count) return ''; const log = ss.log || [];
  return `<div class="sdots" title="Sessions">${Array.from({ length: ss.count }, (_, i) => { const lg = log[i]; const c = lg ? (lg.pnl > 0 ? 'w' : 'l') : i + 1 === ss.current && ds === 'trading' ? 'c' : ''; return `<i class="${c}"></i>`; }).join('')}<span>${Math.min(ss.done, ss.count)}/${ss.count}</span></div>`; }
function botLine(x) { if (!x.on) return x.halt ? 'Halted: ' + x.halt : x.state === 'halted' ? (x.msg || 'Halted') : 'Ready'; if (x.pos) return `${sideLabel(x.pos.type, x.pos.barrier) || (x.pos.dir === 'up' ? 'Rise' : 'Fall')} open · ${money(x.pos.stake)}`; return x.msg || 'Watching'; }
function cardHtml(x, real) { if (x.id === 'atsbot') return abCardHtml(x, real); const [cc, ct] = stateChip(x); const d = x.day || {}; const demoOnly = real && x.id !== 'ats';
  const wr = d.trades ? Math.round((d.wins || 0) / d.trades * 100) + '%' : '—';
  return `<article class="bcard${x.on ? ' on' : ''}" data-bot="${x.id}">
    <header class="bc-h"><span class="mono">${x.mono}</span><div class="bc-t"><b>${esc(x.name)}</b><small>${esc(x.contract)} · ${esc(x.market)}</small></div><span class="chip ${cc}">${ct}</span></header>
    <div class="bc-m"><div><span class="eyebrow">Today</span><b class="${cls(d.pnl)}">${money(d.pnl || 0, true)}</b></div><div><span class="eyebrow">Trades</span><b>${d.trades || 0}</b></div><div><span class="eyebrow">Win rate</span><b>${wr}</b></div><div><span class="eyebrow">Stake</span><b>${x.next && x.next.stake ? money(x.next.stake) : money(x.params.stake)}</b></div></div>
    ${dayBar(d.pnl, d.stop != null ? d.stop : x.params.day_sl, d.lock != null ? d.lock : x.params.day_tp)}
    <div class="bc-s"><span>${esc(botLine(x))}</span>${sesDots(x.ses, d.state)}</div>
    <footer class="bc-f"><button type="button" class="btn ${x.on ? 'ghost' : real && !demoOnly ? 'real' : 'primary'} sm" data-act="go"${R.busy || (x.open && !x.running) || demoOnly ? ' disabled' : ''}>${x.on ? (x.running ? I.stop + 'Stop' : 'Stopping…') : I.play + 'Start'}</button><button type="button" class="btn ghost sm" data-act="open">Details${I.chev}</button></footer>
  </article>`; }
function mt5CardHtml() { const M = window.ATSMT5 && window.ATSMT5.data(); if (!M) return `<article class="bcard" data-bot="mt5"><header class="bc-h"><span class="mono">M5</span><div class="bc-t"><b>MT5</b><small>V25 (1s) CFD · Deriv-Demo</small></div><span class="chip">Loading</span></header><div class="bc-s"><span>Connecting…</span></div><footer class="bc-f"><button type="button" class="btn ghost sm" data-act="open">Details${I.chev}</button></footer></article>`;
  const e = M.ea || {}, t = e.today || {}, set = e.settings || {}, rec = e.recovery || {}, run = M.control === 'run', p = e.position;
  const [ct, cc] = window.ATSMT5.chip(M); const wr = t.trades ? Math.round(t.wins / t.trades * 100) + '%' : '—';
  return `<article class="bcard${run ? ' on' : ''}" data-bot="mt5">
    <header class="bc-h"><span class="mono">M5</span><div class="bc-t"><b>MT5</b><small>${set.reverse ? 'Reversed · ' : ''}${esc(set.lots)} lot · V25 (1s) CFD</small></div><span class="chip ${cc}">${esc(ct)}</span></header>
    <div class="bc-m"><div><span class="eyebrow">Today</span><b class="${cls(t.pnl)}">${money(t.pnl || 0, true)}</b></div><div><span class="eyebrow">Trades</span><b>${t.trades || 0}</b></div><div><span class="eyebrow">Win rate</span><b>${wr}</b></div><div><span class="eyebrow">Recovery</span><b>${rec.on ? `${rec.step || 0}/${rec.steps}` : 'Off'}</b></div></div>
    ${dayBar(t.pnl, set.day_sl, set.day_tp)}
    <div class="bc-s"><span>${esc(p ? `${p.dir === 'up' ? 'Buy' : 'Sell'} ${p.lots} open · ${money(p.profit, true)}` : e.reason || '')}</span></div>
    <footer class="bc-f"><button type="button" class="btn ${run ? 'ghost' : 'primary'} sm" data-act="go"${window.ATSMT5.busy() ? ' disabled' : ''}>${run ? I.stop + 'Stop' : I.play + 'Start'}</button><button type="button" class="btn ghost sm" data-act="open">Details${I.chev}</button></footer></article>`; }
let lastCards = '';
function renderHome() {
  const paired = R.hasKey(); $('pairCard').hidden = paired && !R.authBad; $('homeMain').hidden = !paired || R.authBad;
  $('atsName').textContent = accountName();
  const st = R.st; if (!st) { $('statusTxt').textContent = !paired ? 'Not paired' : R.err ? R.err : 'Connecting…'; $('statusLine').className = 'status-line' + (R.err ? ' err' : ''); return; }
  const bots = allBots(st), real = isReal(st), M = window.ATSMT5 && window.ATSMT5.data();
  const todayAll = bots.reduce((a, x) => a + (+(x.day && x.day.pnl) || 0), 0), trades = bots.reduce((a, x) => a + (+(x.day && x.day.trades) || 0), 0);
  const mt5On = !!(M && M.control === 'run'); const running = bots.filter(x => x.on).length + (mt5On ? 1 : 0);
  const sum = `<div class="sm"><span class="eyebrow">Balance</span><b>${money(st.account.balance)}</b><small>${real ? 'Real' : 'Demo'} · ${esc(st.account.prefix || '')}</small></div>
    <div class="sm"><span class="eyebrow">Today</span><b class="${cls(todayAll)}">${money(todayAll, true)}</b><small>${trades} trade${trades === 1 ? '' : 's'} · Deriv bots</small></div>
    <div class="sm"><span class="eyebrow">Running</span><b>${running}<em>/6</em></b><small>${M && M.ea && M.ea.today ? 'MT5 ' + money(M.ea.today.pnl || 0, true) : 'bots'}</small></div>`;
  if ($('summary').innerHTML !== sum) $('summary').innerHTML = sum;
  const html = bots.map(x => cardHtml(x, real)).join('') + mt5CardHtml();
  if (html !== lastCards) { lastCards = html; $('bots').innerHTML = html;
    $('bots').querySelectorAll('.bcard').forEach(c => { const id = c.dataset.bot;
      c.querySelector('[data-act=open]').onclick = () => id === 'mt5' ? go('mt5') : go('bot', id);
      const g = c.querySelector('[data-act=go]'); if (g) g.onclick = () => id === 'mt5' ? window.ATSMT5.toggle() : startStop(id); }); }
  $('stopAll').hidden = running < 1; $('stopAll').disabled = R.busy; $('stopAll').innerHTML = I.stop + 'Stop all';
  const rec = bots.flatMap(x => x.recent.map(r => Object.assign({ bot_id: x.id }, r))).sort((a, b) => b.t - a.t).slice(0, 8);
  const rh = rec.length ? rec.map(h => tradeRow(h, true)).join('') : '<li class="empty">No trades yet</li>'; if ($('recent').innerHTML !== rh) $('recent').innerHTML = rh;
  const age = R.lastOk ? Math.round((Date.now() - R.lastOk) / 1000) : null;
  $('statusTxt').textContent = R.err ? 'Offline · ' + R.err : `Server v${st.version} · ${st.feed === 'open' ? 'feed live' : 'feed ' + st.feed}${age != null && age > 15 ? ' · ' + age + 's ago' : ''}`;
  $('statusLine').className = 'status-line' + (R.err ? ' err' : ' ok'); }
async function startStop(id) { const st = R.st; if (!st) return; const x = botOf(st, id); if (!x) return;
  if (x.on) { try { await R.stop(id); toast({ level: 'info', title: x.name + ' stopping', text: x.open ? 'Waiting for the open trade to settle' : '' }); } catch (e) { errToast(e); } return; }
  if (id === 'ats' && isReal(st)) { if (!(await ask({ title: 'Start on real money?', text: 'Rise and Fall will trade your real balance.', real: true, ok: 'Start' }))) return; }
  if (id === 'atsbot' && isReal(st)) { const p = x.params; if (!(await ask({ title: 'Start ATS Bot on real money?', text: `It trades your real balance: ${money(p.stake)} stake, ×${p.mg_factor} after a loss, stops for the day at +${money(p.target)} or when the daily loss cap is reached.`, real: true, ok: 'Start on Real' }))) return; }
  try { await R.start(id); } catch (e) { errToast(e); } }
/** Everything running: Deriv bots that are on plus the MT5 EA when it is allowed to trade. */
function runningNames(st) { const M = window.ATSMT5 && window.ATSMT5.data(); return (st ? allBots(st).filter(x => x.on).map(x => x.name) : []).concat(M && M.control === 'run' ? ['MT5'] : []); }
async function stopAllNow() { const st = R.st; if (!st) return; const names = runningNames(st); if (!names.length) return;
  if (!(await ask({ title: 'Stop all bots?', text: names.join(', '), ok: 'Stop all', danger: true }))) return;
  try { const M = window.ATSMT5 && window.ATSMT5.data(); const d = await R.stopAll();
    if ((!d || !d.mt5 || !d.mt5.ok) && M && M.control === 'run') await window.ATSMT5.stop(); else if (window.ATSMT5) window.ATSMT5.load().then(() => render());
    toast({ level: 'info', title: 'All bots stopped' }); } catch (e) { errToast(e); } }
$('stopAll').onclick = stopAllNow; $('stopTop').onclick = stopAllNow;

/* ---------- trade rows ---------- */
function tradeRow(h, showBot) { const t = h.type || h.contract_type, set = h.status === 'settled' || h.status === 'won' || h.status === 'lost' || (h.profit != null && h.status !== 'open');
  const b = BOT[h.bot_id] || BOT.ats; const up = t === 'CALL' || t === 'DIGITOVER' || t === 'DIGITEVEN' || t === 'DIGITMATCH';
  const glyph = t === 'CALL' ? I.up : t === 'PUT' ? I.down : t === 'DIGITEVEN' ? 'E' : t === 'DIGITODD' ? 'O' : t === 'DIGITOVER' ? '&gt;' + esc(h.barrier) : t === 'DIGITUNDER' ? '&lt;' + esc(h.barrier) : t === 'DIGITMATCH' ? '=' + esc(h.barrier) : t === 'DIGITDIFF' ? '≠' + esc(h.barrier) : '·';
  const tags = (h.mode === 'real' ? '<span class="tag real">REAL</span>' : '') + (h.step ? `<span class="tag">step ${h.step}</span>` : '') + (h.capped ? '<span class="tag">capped</span>' : '');
  if (h.bot_id === 'atsbot') { const w = +h.profit > 0; return `<li><span class="t-ico ${!set || w ? 'u' : 'd'}">${!set ? '·' : w ? I.check : I.x}</span><div class="t-main"><b>${!set ? 'Trade open' : w ? 'Won' : 'Lost'}${h.mode === 'real' ? '<span class="tag real">REAL</span>' : ''}</b><small>${showBot ? 'ATS Bot · ' : ''}${fmtT(h.t)} · ${money(h.stake)}</small></div><div class="amt ${set ? cls(h.profit) : 'muted'}">${set ? money(h.profit, true) : 'Open'}</div></li>`; }
  return `<li><span class="t-ico ${up ? 'u' : 'd'}">${glyph}</span><div class="t-main"><b>${esc(sideLabel(t, h.barrier))}${tags}</b><small>${showBot ? esc(b.name) + ' · ' : ''}${fmtT(h.t)} · ${money(h.stake)}</small></div><div class="amt ${set ? cls(h.profit) : 'muted'}">${set ? money(h.profit, true) : 'Open'}</div></li>`; }

/* ---------- bot detail ---------- */
let form = null, formSig = '';
$('botBack').onclick = () => go('home');
$('botHistLink').onclick = () => { histBot = botId; go('history'); };
$('botGo').onclick = () => startStop(botId);
function rfFormValues(x) { const p = x.params; return Object.assign({}, p, { cycle: p.cycle === 'ticks' || p.cycle === 'custom' ? '5m' : p.cycle }); }
function mountForm(x) { const sig = x.id; if (form && formSig === sig) return;
  if (form) form.destroy(); formSig = sig; $('botSave').hidden = true;
  const schema = x.id === 'ats' ? RF_SCHEMA : dgSchema(x.id);
  form = new FormCtl($('botForm'), schema, x.id === 'ats' ? rfFormValues(x) : x.params, { prefix: 'b_' + x.id, onChange: f => { $('botSave').hidden = !f.dirty; } }); }
$('botDiscard').onclick = () => { if (!form) return; form.discard(); $('botSave').hidden = true; };
$('botSaveBtn').onclick = async () => { if (!form || !R.st) return; const ch = form.changes();
  if (Object.values(ch).some(v => v === '' || (typeof v === 'number' && isNaN(v)))) { toast({ level: 'error', title: 'Fill in every field with a number' }); return; }
  const btn = $('botSaveBtn'); btn.disabled = true;
  try { if (botId === 'ats') { const cur = botOf(R.st, 'ats').params; await R.saveParams(Object.assign({}, cur, form.draft, { strategy: 'classic' })); }
    else await R.saveBot(botId, ch);
    const x = botOf(R.st, botId); form.saved(botId === 'ats' ? rfFormValues(x) : x.params); $('botSave').hidden = true; toast({ level: 'win', title: 'Saved', text: BOT[botId].name }); }
  catch (e) { errToast(e); } btn.disabled = false; };
function analysisHtml(x) {
  if (x.id === 'ats') { const s = x.signal || {}, sk = x.skip;
    return `<section class="card"><div class="card-h"><h3>Signal</h3><span class="muted">${s.at ? hm(s.at) : ''}</span></div>
      <div class="sig"><span class="sig-dir ${s.dir === 'up' ? 'up' : s.dir === 'down' ? 'dn' : ''}">${s.dir === 'up' ? I.up + 'Rise' : s.dir === 'down' ? I.down + 'Fall' : 'Neutral'}</span><b>${s.conf != null ? s.conf + '%' : '—'}</b><small>${s.note ? esc(s.note) : `${esc(s.tf || '')} candles · lean ${esc(s.lean || '—')}`}</small></div>
      ${sk ? `<p class="muted small">Last skip ${hm(sk.at)}: ${esc(sk.why)}</p>` : ''}</section>`; }
  const an = x.analysis; if (!an || !an.a || an.a.even_pct == null) return `<section class="card"><div class="card-h"><h3>Analysis</h3></div><p class="muted">${x.on ? 'Reading the market…' : '—'}</p></section>`;
  return digitPanel(x, an); }
/** Digit analysis exactly as Mohamed's HTML: signal cards, sequence, streaks, primary bars, digit grid (most green, least red). */
const SYMN = s => (SYMBOLS.find(o => o[0] === s) || [s, s])[1];
function digitPanel(x, an) {
  const a = an.a, p = an.p || x.effective || x.params, id = x.id, f1 = v => (+v || 0).toFixed(1), c = an.cards;
  const mode = id === 'evenodd' ? 'eo' : id === 'overunder' ? 'ou' : 'md';
  const card = (cl, lab, o, txt) => `<div class="sg-card ${cl}"><span>${esc(lab)}</span><b>${o ? esc(o.name) : 'Scanning…'}</b><em>${o ? esc(txt(o)) : '—'}</em></div>`;
  const sig = !c ? '' : mode === 'eo' ? card('a', 'Most Even', c.even, o => f1(o.pct) + '%') + card('b', 'Most Odd', c.odd, o => f1(o.pct) + '%')
    : mode === 'ou' ? card('a', 'Most Over', c.over, o => f1(o.pct) + '%') + card('b', 'Most Under', c.under, o => f1(o.pct) + '%')
    : (p.digit_src === 'user' ? card('a', 'Most D' + p.digit, c.most, o => `D${o.digit} · ${f1(o.pct)}%`) + card('b', 'Least D' + p.digit, c.least, o => `D${o.digit} · ${f1(o.pct)}%`)
      : card('a', 'Most Occurring Digit', c.most, o => `D${o.digit} · ${f1(o.pct)}%`) + card('b', 'Least Occurring Digit', c.least, o => `D${o.digit} · ${f1(o.pct)}%`));
  const seqT = mode === 'eo' ? 'Even / Odd Sequence' : mode === 'ou' ? 'Over / Under Sequence' : 'Digit Sequence';
  const chip = (ch, i, n) => { const cl = mode === 'md' ? (+ch % 2 === 0 ? 'even' : 'odd') : mode === 'eo' ? (ch === 'E' ? 'even' : 'odd') : ch === 'O' ? 'over' : ch === 'U' ? 'under' : 'mid';
    return `<i class="${cl}${i === n - 1 ? ' newest' : ''}">${esc(ch)}</i>`; };
  const seq = (a.seq || []).map((ch, i, arr) => chip(ch, i, arr.length)).join('');
  const st = a.streaks, tt = mode === 'eo' ? ['Even Streaks', 'Odd Streaks'] : ['Over Streaks', 'Under Streaks'];
  const sbox = (cl, t, cur, mx, avg) => `<div class="sk-box ${cl}"><b>${t}</b><div><span><small>Current</small>${cur}</span><span><small>Max</small>${mx}</span><span><small>Avg</small>${avg ? (+avg).toFixed(2) : '0'}</span></div></div>`;
  const streaks = st ? `<div class="sk-grid">${sbox('a', tt[0], st.curA, st.maxA, st.avgA)}${sbox('b', tt[1], st.curB, st.maxB, st.avgB)}</div>` : '';
  const bar = (cl, txt, pc) => `<div class="pb-track"><div class="pb-fill ${cl}" style="width:${f1(pc)}%"><span>${esc(txt)}</span></div></div>`;
  const bars = mode === 'eo' ? bar('a', `Even ${f1(a.even_pct)}% (${a.even})`, a.even_pct) + bar('b', `Odd ${f1(a.odd_pct)}% (${a.odd})`, a.odd_pct)
    : mode === 'ou' ? bar('a', `Over ${a.over_digit} · ${f1(a.over_pct)}% (${a.over})`, a.over_pct) + bar('b', `Under ${a.under_digit} · ${f1(a.under_pct)}% (${a.under})`, a.under_pct) : '';
  const peak = Math.max(...a.freq, 1);
  const grid = a.freq.map((v, d) => `<div class="dg-cell${d === a.most ? ' most' : ''}${d === a.least ? ' least' : ''}"><small>${f1(a.freq_pct[d])}%</small><div class="dg-plot"><i style="height:${Math.max(2, v / peak * 58) * 48 / 58}px"></i></div><b>${d}</b></div>`).join('');
  const next = an.wait ? esc(an.wait) : an.contract_type ? `${esc(sideLabel(an.contract_type, an.barrier))} on ${esc(SYMN(an.trade_symbol || p.symbol))}` : '';
  return `<section class="card dg-panel"><div class="card-h"><h3>Live Signals</h3><span class="muted">${a.n} ticks · ${esc(SYMN(an.symbol || p.symbol))} · ${hm(an.at)}</span></div>
    ${sig ? `<div class="sg-grid">${sig}</div>` : ''}${next ? `<p class="dg-next"><span class="eyebrow">Next</span>${next}</p>` : ''}</section>
    <section class="card dg-panel"><div class="card-h"><h3>${seqT}</h3></div><div class="sq-strip">${seq}</div></section>
    ${streaks ? `<section class="card dg-panel"><div class="card-h"><h3>Streak Analysis</h3></div>${streaks}</section>` : ''}
    ${bars ? `<section class="card dg-panel"><div class="card-h"><h3>${mode === 'eo' ? 'Even / Odd' : 'Over / Under'}</h3></div><div class="pb-list">${bars}</div></section>` : ''}
    <section class="card dg-panel"><div class="card-h"><h3>Digit Statistics</h3></div><div class="dg-grid">${grid}</div>
      <div class="ml-row"><span class="ml most">Most occurring: <b>${a.most}</b></span><span class="ml least">Least occurring: <b>${a.least}</b></span></div></section>`; }
function liveHtml(x) { const d = x.day || {}, ss = x.ses, pos = x.pos;
  const mg = x.params.martingale ? `${x.step || 0}/${x.params.mg_max_steps} · ×${(x.mgFactor || x.params.mg_factor || 0).toFixed ? (+(x.mgFactor || x.params.mg_factor)).toFixed(2) : x.params.mg_factor}` : 'Off';
  return `<section class="card live-card"><div class="lv-top"><div><span class="eyebrow">Today</span><div class="big ${cls(d.pnl)}">${money(d.pnl || 0, true)}</div></div><div class="lv-r"><span class="eyebrow">All time</span><b class="${cls(x.stats.pnl)}">${money(x.stats.pnl || 0, true)}</b><small>${x.stats.n || 0} trades · ${pct(x.stats.winrate, 0)}</small></div></div>
    ${dayBar(d.pnl, d.stop != null ? d.stop : x.params.day_sl, d.lock != null ? d.lock : x.params.day_tp)}
    <div class="kvs"><div><span class="eyebrow">Trades</span><b>${d.trades || 0}</b></div><div><span class="eyebrow">Win rate</span><b>${d.trades ? Math.round(d.wins / d.trades * 100) + '%' : '—'}</b></div><div><span class="eyebrow">Next stake</span><b>${x.next && x.next.stake ? money(x.next.stake) : money(x.params.stake)}</b></div><div><span class="eyebrow">Martingale</span><b>${mg}</b></div></div>
    ${ss && ss.on ? `<div class="ses-row"><span>${d.state !== 'trading' || ss.done >= ss.count ? `${Math.min(ss.done, ss.count)}/${ss.count} sessions` : `Session ${ss.current}/${ss.count} · ${money(ss.pnl, true)}`}${ss.until ? ' · next ' + hm(ss.until) : ''}</span>${sesDots(ss, d.state)}</div>` : ''}
    <p class="lv-msg">${esc(botLine(x))}</p>
    ${sinceHtml(x.started_at)}
    ${pos ? `<div class="pos"><span class="eyebrow">Open contract</span><b>${esc(pos.label || sideLabel(pos.type, pos.barrier) || (pos.dir === 'up' ? 'Rise' : 'Fall'))} · ${money(pos.stake)}</b>${pos.pnl != null ? `<span class="${cls(pos.pnl)}">${money(pos.pnl, true)}</span>` : ''}</div>` : ''}</section>`; }
let lastLive = '', lastAn = '', lastBR = '';
function renderBot() { const st = R.st; if (!st) return; const x = botOf(st, botId); if (!x) { go('home'); return; }
  const real = isReal(st), demoOnly = real && x.id !== 'ats';
  $('botMono').textContent = x.mono; $('botName').textContent = x.name; $('botSub').textContent = `${x.contract} · ${x.market}`;
  const [cc, ct] = stateChip(x); $('botChip').className = 'chip ' + cc; $('botChip').textContent = ct;
  const g = $('botGo'); g.className = 'btn ' + (x.on ? 'ghost' : real && !demoOnly ? 'real' : 'primary'); g.innerHTML = x.on ? (x.running ? I.stop + 'Stop' : 'Stopping…') : I.play + 'Start'; g.disabled = R.busy || (x.open && !x.running) || demoOnly;
  const lv = liveHtml(x); if (lv !== lastLive) { lastLive = lv; $('botLive').innerHTML = lv; }
  const an = analysisHtml(x); if (an !== lastAn) { lastAn = an; $('botAnalysis').innerHTML = an; }
  const br = x.recent.length ? x.recent.slice(0, 10).map(h => tradeRow(Object.assign({ bot_id: x.id }, h))).join('') : '<li class="empty">No trades yet</li>'; if (br !== lastBR) { lastBR = br; $('botRecent').innerHTML = br; }
  mountForm(x); form.patch(x.id === 'ats' ? rfFormValues(x) : x.params); form.setDisabled(x.on);
  $('botFormLock').hidden = !x.on; $('botFormNote').textContent = ''; }

/* ---------- ATS Bot (v4.14): compact dashboard. Never shows what it trades. Follows the account (Demo / Real), locks for the day after its target or stop. ---------- */
const AB_ICON = '<svg viewBox="0 0 24 24"><path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z" fill="currentColor" stroke="none"/></svg>';
const AB_RESET = '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/></svg>';
const abLock = x => (x.ab && x.ab.lock) || null;
function abChip(x) { const o = x.outcome; return x.on ? (x.running ? ['live', 'Running'] : ['warn', 'Stopping']) : o === 'target' ? ['ok', 'Target hit'] : o === 'stopped' ? ['bad', 'Stopped'] : o === 'halted' ? ['bad', 'Halted'] : ['', 'Ready']; }
function abStatus(x) { const td = x.ab.today || {}, lk = abLock(x);
  if (x.on && !x.running) return 'Finishing the last trade…';
  if (x.running) return x.pos ? `Trade open · ${money(x.pos.stake)}` : /^(Analysing|Waiting|Cooling)/.test(x.msg || '') ? x.msg : td.trades ? `Trading · ${td.trades} trade${td.trades === 1 ? '' : 's'} today` : 'Reading the market…';
  if (lk) return lk.text;
  if (x.outcome === 'halted') return x.msg || 'Stopped';
  return 'Ready'; }
const abAnalysing = x => !!(x.running && !x.pos && /^(Analysing|Waiting|Cooling)/.test(x.msg || ''));
function abBar(pnl, target) { const t = Math.max(0.01, +target || 1), w = Math.max(0, Math.min(1, (+pnl || 0) / t)) * 100;
  return `<div class="ab-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(w)}"><i style="width:${w.toFixed(1)}%"></i></div>`; }
const abWr = td => td.trades ? Math.round(td.wins / td.trades * 100) + '%' : '—';
function abCardHtml(x, real) { const [cc, ct] = abChip(x), td = x.ab.today || {}, t = +x.params.target || 1, lk = abLock(x), dis = R.busy || (x.open && !x.running) || (!x.on && !!lk);
  return `<article class="bcard ab-card${x.on ? ' on' : ''}" data-bot="atsbot">
    <header class="bc-h"><span class="mono ab-mono">${AB_ICON}</span><div class="bc-t"><b>ATS Bot</b><small>Auto trading · target ${money(t)}</small></div><span class="chip ${cc}">${ct}</span></header>
    <div class="bc-m"><div><span class="eyebrow">Today</span><b class="${cls(td.pnl)}">${money(td.pnl || 0, true)}</b></div><div><span class="eyebrow">Wins</span><b>${td.wins || 0}</b></div><div><span class="eyebrow">Losses</span><b>${td.losses || 0}</b></div><div><span class="eyebrow">Win rate</span><b>${abWr(td)}</b></div></div>
    ${abBar(td.pnl, t)}
    <div class="bc-s"><span${abAnalysing(x) ? ' class="ab-analysing"' : ''}>${!x.on && lk ? I.lock : ''}${esc(abStatus(x))}</span><span class="ab-pct">${Math.round((x.ab.progress || 0) * 100)}%</span></div>
    <footer class="bc-f"><button type="button" class="btn ${x.on ? 'ghost' : real ? 'real' : 'primary'} sm" data-act="go"${dis ? ' disabled' : ''}>${x.on ? (x.running ? I.stop + 'Stop' : 'Stopping…') : lk ? I.lock + 'Locked' : I.play + 'Start'}</button><button type="button" class="btn ghost sm" data-act="open">Open${I.chev}</button></footer>
  </article>`; }
const AB_SCHEMA = [{ title: 'Parameters', fields: [
  nm('stake', 'Stake', '$', 'First trade of every chain'),
  nm('payout_pct', 'Payout', '%', 'Profit per win; the recovery stake is sized from live prices'),
  nm('target', 'Daily target', '$', 'Locks for the day when today is up this much'),
  it('max_consec_losses', 'Stop after', 'losses', 'Losses in a row that count as one stop'),
  it('max_stops', 'Stops per day', '', 'Stop events that lock the day'),
  it('cooloff_min', 'Cool-off after a stop', 'min', 'Wait before trading again'),
  it('pause_win', 'Pause after win', 's', 'Wait, then a fresh read'),
  it('pause_loss', 'Pause after loss', 's', 'Wait before the recovery trade'),
  sw('patient', 'Patient mode', 'Space trades through the day'),
  it('gap_min', 'Gap between trades', 'min', 'Minimum wait after a win', d => d.patient !== false),
  it('per_hour', 'Max trades per hour', '', 'Then it waits', d => d.patient !== false)] }];
let abForm = null, abOpen = false, lastAbHero = '', lastAbRec = '';
const abVals = p => ({ stake: p.stake, payout_pct: p.payout_pct != null ? p.payout_pct : 25, target: p.target, max_consec_losses: p.max_consec_losses, pause_win: p.pause_win != null ? p.pause_win : 5, pause_loss: p.pause_loss != null ? p.pause_loss : 30, patient: p.patient !== false, gap_min: p.gap_min != null ? p.gap_min : 3, per_hour: p.per_hour != null ? p.per_hour : 6, cooloff_min: p.cooloff_min != null ? p.cooloff_min : 60, max_stops: p.max_stops != null ? p.max_stops : 1 });
let abRec = null; // v4.17: recovery sized by the server from live quotes (stakes, factor, worst)
function abWorst(d) { const s = +d.stake, pct = +d.payout_pct, n = Math.round(+d.max_consec_losses), k = Math.max(1, Math.round(+d.max_stops || 1)); if (!(s > 0 && pct > 0 && n >= 1 && n <= 20)) return '';
  const r = abRec, same = r && r.stakes && r.stakes[0] === s && r.stakes.length === n;
  let ch = same ? r.stakes.slice() : null;
  if (!ch) { const prof = Math.ceil(s * (1 + pct / 100) * 100 - 1e-6) / 100 - s, ratio = r && r.ratio ? r.ratio : 0.27; ch = [s]; let loss = s;
    for (let i = 1; i < n; i++) { const st = Math.ceil((loss + prof) / ratio * 100) / 100; ch.push(st); loss += st; } }
  const chain = ch.reduce((a, b) => a + b, 0), worst = Math.round(chain * k * 100) / 100, ap = same ? '' : '≈ ';
  const rec = n > 1 ? `Recovery ${ap}${money(ch[1])} (×${(ch[1] / s).toFixed(2)}) · ` : '';
  return `${rec}worst case for one day −${ap}${money(worst)}${k > 1 ? ' · ' + k + ' stops' : ''}`; }
function abMountForm(x) { if (abForm) return; $('abSave').hidden = true;
  abForm = new FormCtl($('abForm'), AB_SCHEMA, abVals(x.params), { prefix: 'ab', onChange: f => { $('abSave').hidden = !f.dirty; $('abWorst').textContent = abWorst(f.draft); } });
  $('abWorst').textContent = abWorst(abVals(x.params)); }
function abToggle(open) { abOpen = open; $('abParamsBox').hidden = !open; $('abParamsBtn').setAttribute('aria-expanded', String(open)); $('abParamsBtn').classList.toggle('open', open); }
$('abParamsBtn').onclick = () => abToggle(!abOpen);
let abActOpen = false; // v4.15: Activity collapsed like Parameters until opened
function abActToggle(open) { abActOpen = open; $('abActBox').hidden = !open; $('abActBtn').setAttribute('aria-expanded', String(open)); $('abActBtn').classList.toggle('open', open); }
$('abActBtn').onclick = () => abActToggle(!abActOpen);
/* v4.18: ATS Bot's own Clear history (this account only). Tap twice to confirm. Today's P/L and the daily lock stay (server side). */
let abClearArm = 0;
$('abClear').onclick = async () => { const el = $('abClear');
  if (Date.now() > abClearArm) { abClearArm = Date.now() + 3500; el.classList.add('arm'); el.querySelector('span').textContent = 'Tap again to clear'; setTimeout(() => { if (Date.now() >= abClearArm) { el.classList.remove('arm'); el.querySelector('span').textContent = 'Clear history'; } }, 3600); return; }
  abClearArm = 0; el.classList.remove('arm'); el.querySelector('span').textContent = 'Clear history';
  try { const d = await R.act('POST', '/api/atsbot/clear-history'); lastAbRec = ''; toast({ level: 'win', title: 'History cleared', text: `${d.removed} ATS Bot trade${d.removed === 1 ? '' : 's'} removed` }); } catch (e) { errToast(e); } };
$('abBack').onclick = () => go('home');
$('abBody').onclick = e => { if (e.target.closest('#abGo')) abGoClick(); else if (e.target.closest('#abReset')) abResetClick(); };
/* v4.16: demo only (the server refuses on real): clears today's demo lock and restarts the day counter; trades stay in Activity. */
async function abResetClick() { try { await R.act('POST', '/api/atsbot/reset-day'); toast({ level: 'win', title: 'Day reset', text: 'Demo is ready to start again' }); } catch (e) { errToast(e); } }
async function abGoClick() { const st = R.st; if (!st) return; const x = botOf(st, 'atsbot'); if (!x) return;
  if (!x.on && abLock(x)) { info('ATS Bot is locked for today', abLock(x).text); return; }
  if (!x.on && abForm && abForm.dirty) { toast({ level: 'warn', title: 'Save or discard your parameter changes first' }); abToggle(true); return; }
  await startStop('atsbot'); }
$('abDiscard').onclick = () => { if (!abForm) return; abForm.discard(); $('abSave').hidden = true; $('abWorst').textContent = abWorst(abForm.draft); };
$('abSaveBtn').onclick = async () => { if (!abForm || !R.st) return; const ch = abForm.changes();
  if (Object.values(ch).some(v => v === '' || (typeof v === 'number' && isNaN(v)))) { toast({ level: 'error', title: 'Fill in every field with a number' }); return; }
  const btn = $('abSaveBtn'); btn.disabled = true;
  try { await R.saveBot('atsbot', ch); const x = botOf(R.st, 'atsbot'); abForm.saved(abVals(x.params)); $('abSave').hidden = true; $('abWorst').textContent = abWorst(abVals(x.params)); toast({ level: 'win', title: 'Saved', text: 'ATS Bot parameters' }); }
  catch (e) { errToast(e); } btn.disabled = false; };
function renderAB() { const st = R.st; if (!st) return; const x = botOf(st, 'atsbot'); if (!x) { go('home'); return; }
  const real = isReal(st), td = x.ab.today || {}, t = +x.params.target || 1, [cc, ct] = abChip(x), lv = Math.round((x.ab.progress || 0) * 100), lk = abLock(x);
  const locked = !x.on && !!lk, dis = R.busy || (x.open && !x.running) || locked;
  const btn = x.on ? (x.running ? I.stop + '<span>Stop</span>' : '<span>Stopping…</span>') : locked ? I.lock + '<span>Locked</span>' : I.play + '<span>Start</span>';
  const hero = `<section class="card ab-hero${x.on ? ' is-on' : ''}${real ? ' is-real' : ''}">
      <div class="ab-top"><span class="ab-logo">${AB_ICON}</span><div class="ab-id"><b>ATS Bot</b><small>Auto trading · ${real ? 'Real' : 'Demo'}</small></div><span class="chip ${cc}">${ct}</span></div>
      <div class="ab-row"><div><span class="eyebrow">Today</span><b class="ab-pnl ${cls(td.pnl)}">${money(td.pnl || 0, true)}</b></div><div class="lv-r"><span class="eyebrow">All time</span><b class="${cls(x.stats.pnl)}">${money((x.stats && x.stats.pnl) || 0, true)}</b><small>${(x.stats && x.stats.n) || 0} trades · ${pct(x.stats && x.stats.winrate, 0)}</small></div></div>
      ${abBar(td.pnl, t)}
      <div class="ab-lv"><span>${lv}% of target</span><span>${money(Math.max(0, t - (+td.pnl || 0)))} to go</span></div>
      <div class="ab-stats"><div><span class="eyebrow">Wins</span><b class="up">${td.wins || 0}</b></div><div><span class="eyebrow">Losses</span><b class="${td.losses ? 'dn' : ''}">${td.losses || 0}</b></div><div><span class="eyebrow">Win rate</span><b>${abWr(td)}</b></div><div><span class="eyebrow">Trades</span><b>${td.trades || 0}</b></div></div>
      <div class="ab-act"><div class="ab-st"><p class="ab-msg${locked ? ' locked' : ''}${abAnalysing(x) ? ' analysing' : ''}">${locked ? I.lock : ''}<span>${esc(abStatus(x))}</span></p>${sinceHtml(x.started_at)}${!real && x.ab.can_reset && !x.on && (lk || td.trades) ? `<button type="button" class="ab-reset" id="abReset"${R.busy ? ' disabled' : ''}>${AB_RESET}<span>Reset day</span></button>` : ''}</div>
        <button type="button" class="ab-go${x.on ? ' on' : ''}${real ? ' real' : ''}" id="abGo"${dis ? ' disabled' : ''} aria-label="${x.on ? 'Stop' : 'Start'} ATS Bot">${btn}</button></div>
    </section>`;
  if (hero !== lastAbHero) { lastAbHero = hero; $('abBody').innerHTML = hero; }
  const rec = x.recent.length ? x.recent.slice(0, 50).map(h => tradeRow(Object.assign({ bot_id: 'atsbot' }, h))).join('') : '<li class="empty">No trades yet</li>';
  if (rec !== lastAbRec) { lastAbRec = rec; $('abRecent').innerHTML = rec; }
  $('abClear').hidden = !x.recent.length || x.on; $('abClear').disabled = R.busy;
  const sub = td.trades ? `${td.trades} trade${td.trades === 1 ? '' : 's'} today` : x.recent.length ? 'Recent trades' : 'No trades yet'; if ($('abActSub').textContent !== sub) $('abActSub').textContent = sub;
  abRec = x.ab.recovery || abRec; abMountForm(x); abForm.patch(abVals(x.params)); abForm.setDisabled(x.on); $('abLock').hidden = !x.on; if (!abForm.dirty) $('abWorst').textContent = abWorst(abVals(x.params)); }

/* ---------- stats ---------- */
let statsBot = 'all', histBot = 'all';
function chips(el, cur, onPick) { const opts = [['all', 'All']].concat(BOTS.map(b => [b.id, b.name]));
  const html = opts.map(([k, n]) => `<button type="button" class="chip-btn${k === cur ? ' on' : ''}" data-k="${k}">${esc(n)}</button>`).join('');
  if (el.innerHTML !== html) { el.innerHTML = html; el.querySelectorAll('button').forEach(b => b.onclick = () => onPick(b.dataset.k)); } }
function meter(v, be) { const w = v == null ? 0 : Math.max(0, Math.min(100, v * 100)); const ok = v != null && be != null && v >= be;
  return `<div class="meter"><i class="${v == null ? '' : ok ? 'ok' : 'bad'}" style="width:${w}%"></i>${be != null ? `<em style="left:${be * 100}%"></em>` : ''}</div>`; }
function sesCard(x) { const ss = x.ses; if (!ss || !ss.on) return ''; const end = e => e === 'tp' ? 'Target' : e === 'sl' ? 'Stop' : 'Day limit';
  return `<section class="card"><div class="card-h"><h3>${esc(x.name)} · sessions today</h3><span class="muted">${Math.min(ss.done, ss.count)}/${ss.count}</span></div>${(ss.log || []).length ? ss.log.map(s => `<div class="row"><div class="l"><b>Session ${s.n}</b><small>${s.trades} trades · ${end(s.end)} · ${hm(s.t)}</small></div><div class="r ${cls(s.pnl)}">${money(s.pnl, true)}</div></div>`).join('') : '<p class="empty">No sessions finished yet</p>'}</section>`; }
function renderStats() { const st = R.st, el = $('statsBody'); chips($('statsChips'), statsBot, k => { statsBot = k; renderStats(); });
  if (!st) { el.innerHTML = '<div class="card"><p class="muted">Connect your server first.</p></div>'; return; }
  const bots = allBots(st), pick = statsBot === 'all' ? bots : bots.filter(x => x.id === statsBot);
  const agg = pick.reduce((a, x) => { a.n += x.stats.n || 0; a.w += x.stats.wins || 0; a.l += x.stats.losses || 0; a.p += +x.stats.pnl || 0; a.dn += x.day.trades || 0; a.dp += +x.day.pnl || 0; return a; }, { n: 0, w: 0, l: 0, p: 0, dn: 0, dp: 0 });
  const wr = agg.n ? agg.w / agg.n : null;
  const be = statsBot === 'ats' || statsBot === 'all' ? 0.51 : (() => { const r = pick[0] && pick[0].ratio; return r ? 1 / (1 + r) : null; })();
  const html = `<div class="st-grid">
      <div class="st"><span class="eyebrow">Win rate</span><div class="st-num">${pct(wr)}</div>${meter(wr, be)}<small>${agg.n} trades${be ? ' · breakeven ' + pct(be, 0) : ''}</small></div>
      <div class="st"><span class="eyebrow">P/L</span><div class="st-num ${cls(agg.p)}">${money(agg.p, true)}</div><small>all trades</small></div>
      <div class="st"><span class="eyebrow">Today</span><div class="st-num ${cls(agg.dp)}">${money(agg.dp, true)}</div><small>${agg.dn} trades</small></div>
      <div class="st"><span class="eyebrow">Wins / losses</span><div class="st-num">${agg.w}–${agg.l}</div><small>${pick.length === 1 ? esc(pick[0].name) : 'all bots'}</small></div></div>
    <section class="card"><div class="card-h"><h3>By bot</h3></div>${bots.map(x => `<div class="row"><div class="l"><b>${esc(x.name)}</b><small>${x.stats.n || 0} trades · ${x.stats.wins || 0}–${x.stats.losses || 0}</small></div><div class="mtr">${meter(x.stats.winrate, x.id === 'ats' ? 0.51 : x.ratio ? 1 / (1 + x.ratio) : null)}</div><div class="r">${pct(x.stats.winrate, 0)}<small class="${cls(x.stats.pnl)}">${money(x.stats.pnl || 0, true)}</small></div></div>`).join('')}</section>
    ${pick.map(sesCard).join('')}
    ${(() => { const lt = st.real || {}; return statsBot === 'all' || statsBot === 'ats' ? `<section class="card"><div class="card-h"><h3>Real money</h3></div><div class="row"><div class="l"><b>Real P/L</b><small>${lt.lifetime_trades || 0} real trades</small></div><div class="r ${cls(lt.lifetime_pnl)}">${money(lt.lifetime_pnl || 0, true)}</div></div></section>` : ''; })()}`;
  if (el.innerHTML !== html) el.innerHTML = html; }

/* ---------- history ---------- */
function histRows() { const rows = (R.hist && R.hist.rows) || []; return rows.filter(h => rowBot(h) !== 'rf1h' && (histBot === 'all' || rowBot(h) === histBot)).slice().reverse(); }
function renderHistory() { chips($('histChips'), histBot, k => { histBot = k; R.wantHist = k; $('histList').innerHTML = '<li class="empty">Loading…</li>'; R.refresh(true).catch(() => { }); renderHistory(); });
  if (R.histBot !== histBot) { if (!R.hist || R.histBot !== histBot) { $('histList').innerHTML = '<li class="empty">Loading…</li>'; return; } }
  const rows = histRows();
  const html = rows.length ? rows.slice(0, 300).map(h => tradeRow({ t: h.t, bot_id: rowBot(h), step: h.step, type: h.contract_type, barrier: h.barrier, stake: h.stake, profit: h.profit, status: h.status, mode: h.mode, capped: h.capped }, histBot === 'all')).join('') : '<li class="empty">No trades here yet</li>';
  if ($('histList').innerHTML !== html) $('histList').innerHTML = html; }
$('exportBtn').onclick = () => { const rows = histRows().slice().reverse(); const cols = ['t', 'contract_id', 'bot', 'mode', 'symbol', 'contract_type', 'barrier', 'step', 'stake', 'payout', 'entry_spot', 'exit_spot', 'profit', 'status', 'why'];
  const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => { const v = c === 't' ? new Date(r.t * 1000).toISOString() : c === 'bot' ? rowBot(r) : r[c]; return v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v; }).join(','))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `ats-history-${histBot}.csv`; a.click(); };

/* ---------- settings ---------- */
let gForm = null, setSig = '';
function renderSettings() { const st = R.st, el = $('setBody');
  if (!st) { if (setSig !== 'none') { setSig = 'none'; if (gForm) { gForm.destroy(); gForm = null; } el.innerHTML = '<div class="card"><p class="muted">Connect your server first.</p></div>'; } return; }
  const real = st.real, rl = isReal(st), pref = themePref(), anyOn = allBots(st).some(x => x.on);
  const sig = [rl, capOn(real), anyOn, pref].join('|');
  if (sig !== setSig) { setSig = sig; if (gForm) { gForm.destroy(); gForm = null; }
    el.innerHTML = `
    <section class="card"><div class="card-h"><h3>Bots</h3></div>${BOTS.map(b => `<button type="button" class="row link-row" data-bot="${b.id}"><div class="l"><b>${esc(b.name)}</b><small data-sub="${b.id}"></small></div>${I.chev}</button>`).join('')}<button type="button" class="row link-row" data-go2="mt5"><div class="l"><b>MT5</b><small>Expert advisor</small></div>${I.chev}</button></section>
    <section class="card"><div class="card-h"><h3>Account</h3></div><div class="row"><div class="l"><b>${rl ? 'Real account' : 'Demo account'}</b><small id="setAcct"></small></div><button type="button" class="link" id="openAcct">Switch</button></div></section>
    <section class="card"><div class="card-h"><h3>Real money</h3></div>
      <div class="row"><div class="l"><b>Lifetime loss cap</b><small id="capTxt"></small></div><label class="switch"><input type="checkbox" id="capOn"${capOn(real) ? ' checked' : ''}><span></span></label></div>
      ${capOn(real) ? `<div class="row"><div class="l"><b>Cap amount</b></div><span class="inp"><i>$</i><input type="text" inputmode="decimal" id="capIn" value="${esc(real.lifetime_cap)}"></span></div>` : ''}</section>
    ${rl ? '' : `<section class="card"><div class="card-h"><h3>Demo tools</h3></div>
      <div class="row"><div class="l"><b>Reset today</b></div><button type="button" class="link" id="resetTodaySet">Reset</button></div>
      <div class="row"><div class="l"><b>Reset demo balance</b></div><button type="button" class="link" id="resetDemo">Reset</button></div>
      <div class="row"><div class="l"><b>Clear history</b>${anyOn ? '<small>Stop all bots first</small>' : ''}</div><button type="button" class="link dn" id="clearHist"${anyOn ? ' disabled' : ''}>Clear</button></div></section>`}
    <div id="notifSlot"></div>
    <section class="card"><div class="card-h"><h3>Appearance</h3></div><div class="seg" id="themeSeg">${['auto', 'light', 'dark'].map(t => `<button type="button" data-t="${t}" class="${pref === t ? 'on' : ''}">${t === 'auto' ? 'Automatic' : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></section>
    <section class="card"><div class="card-h"><h3>Server</h3></div><div class="row"><div class="l"><b>Connected</b><small>${esc(R.url().replace('https://', ''))}</small></div><button type="button" class="link dn" id="forgetKey">Unpair</button></div></section>
    <p class="muted small center">ATS app v${APP_VER}</p>`;
    const q = id => el.querySelector('#' + id); if (window.ATSPush) window.ATSPush.mount(q('notifSlot'));
    el.querySelectorAll('[data-bot]').forEach(b => b.onclick = () => go('bot', b.dataset.bot)); el.querySelector('[data-go2]').onclick = () => go('mt5');
    el.querySelectorAll('#themeSeg button').forEach(b => b.onclick = () => setTheme(b.dataset.t));
    q('openAcct').onclick = openAccount;
    if (q('resetDemo')) q('resetDemo').onclick = resetDemo; if (q('resetTodaySet')) q('resetTodaySet').onclick = resetToday; if (q('clearHist')) q('clearHist').onclick = clearHistory;
    q('capOn').onchange = async () => { try { await R.realCap(q('capOn').checked ? 10 : 0, false); toast({ level: 'info', title: q('capOn').checked ? 'Lifetime cap on' : 'Lifetime cap off' }); } catch (e) { errToast(e); } setSig = ''; renderSettings(); };
    if (q('capIn')) q('capIn').onchange = async () => { const v = +String(q('capIn').value).replace(',', '.'); if (!(v >= 1)) { setSig = ''; renderSettings(); return; } const up = v > +real.lifetime_cap;
      if (up && !(await ask({ title: 'Raise the lifetime cap?', text: `Allow up to ${money(v)} of total real losses.`, ok: 'Raise' }))) { setSig = ''; renderSettings(); return; }
      R.realCap(v, up).then(() => toast({ level: 'info', title: 'Lifetime cap set', text: money(v) }), errToast); };
    q('forgetKey').onclick = async () => { if (await ask({ title: 'Unpair this device?', text: 'The key is removed from this device.', ok: 'Unpair', danger: true })) { R.forget(); go('home'); } };
  }
  for (const b of BOTS) { const x = botOf(st, b.id), s = el.querySelector(`[data-sub="${b.id}"]`); if (x && s) { const t = `${x.on ? 'Running' : 'Stopped'} · ${x.contract} · stake ${money(x.params.stake)}`; if (s.textContent !== t) s.textContent = t; } }
  const t1 = `${esc(st.account.prefix || '')} · balance ${money(st.account.balance)}`; if ($('setAcct').textContent !== t1) $('setAcct').textContent = t1;
  $('capTxt').textContent = capOn(real) ? `${money(real.lifetime_lost)} lost · ${money(real.room_left)} left` : 'Off'; }

/* ---------- account sheet ---------- */
function openAccount() { const st = R.st; if (!st) return; const real = st.real, a = st.account, rl = isReal(st); const err = a.error && !a.verified ? a.error : '';
  sheet(`<span class="eyebrow">${rl ? 'Real account' : 'Demo account'}</span><div class="bal${rl ? ' gold' : ''}">${money(a.balance)}</div><p class="muted">${esc(a.prefix || '')}${a.verified ? ' · verified' : ''}</p>
    <div class="seg acct"><button type="button" data-m="demo" class="${rl ? '' : 'on'}">Demo</button><button type="button" data-m="real" class="${rl ? 'on real' : ''}"${!real.available && !rl ? ' disabled' : ''}>Real</button></div>
    ${!real.available ? `<div class="notice bad">${I.alert}<span>${esc(real.reason)}</span></div>` : ''}${err ? `<div class="notice bad">${I.alert}<span>${esc(err)}</span></div>` : ''}
    <div class="btns">${rl ? '' : `<button type="button" class="btn block" id="shDay">Reset today</button><button type="button" class="btn ghost block" id="shReset">Reset demo balance</button>`}<button type="button" class="btn ghost block" id="shClose">Done</button></div>`, s => {
    s.querySelector('#shClose').onclick = closeSheet;
    const rb = s.querySelector('#shReset'); if (rb) rb.onclick = () => { closeSheet(); resetDemo(); }; const db = s.querySelector('#shDay'); if (db) db.onclick = () => { closeSheet(); resetToday(); };
    s.querySelectorAll('.seg.acct button').forEach(b => b.onclick = () => { if (b.disabled) return; const m = b.dataset.m; if ((m === 'real') === rl) return; if (m === 'real') enableReal(); else { closeSheet(); disableReal(); } }); }); }
$('acctPill').onclick = () => { if (!R.st) { if (!R.hasKey()) go('home'); return; } openAccount(); };
async function enableReal() { const st = R.st, real = st.real;
  if (!real.available) { info('Real mode isn’t available', real.reason); return; }
  if (allBots(st).some(x => x.on)) { info('Stop all bots first', 'Switch modes while nothing is running.'); return; }
  if (!(await ask({ title: 'Switch to Real money?', text: 'Rise and Fall will trade your real balance.', real: true, ok: 'Switch' }))) return;
  try { await R.realOn(); catchUpEvents(R.st); toast({ level: 'warn', title: 'Real money mode on' }); } catch (e) { errToast(e); } }
async function disableReal() { try { await R.realOff(); catchUpEvents(R.st); toast({ level: 'info', title: 'Back on demo' }); } catch (e) { errToast(e); } }
async function resetDemo() { if (!(await ask({ title: 'Reset demo balance?', text: 'Demo balance returns to the default. Real money is not touched.', ok: 'Reset' }))) return;
  try { const d = await R.resetDemo(); catchUpEvents(R.st); toast({ level: 'win', title: 'Demo balance reset', text: d.balance != null ? money(d.balance) : '' }); } catch (e) { errToast(e); } }
async function resetToday() { const st = R.st; if (!st) return; if (isReal(st)) { info('Can’t reset today on real', 'Switch to demo first.'); return; }
  if (!(await ask({ title: 'Reset today?', text: 'Today’s P/L goes back to $0 for every Deriv bot. History is kept.', ok: 'Reset' }))) return;
  try { await R.resetToday(); catchUpEvents(R.st); toast({ level: 'info', title: 'Today reset' }); } catch (e) { errToast(e); } }
async function clearHistory() { const st = R.st; if (!st) return; if (isReal(st)) { info('Can’t clear history on real', 'Switch to demo first.'); return; }
  if (allBots(st).some(x => x.on)) { info('Stop all bots first'); return; }
  if (!(await ask({ title: 'Clear history?', text: 'Demo trades and stats are wiped. This can’t be undone.', ok: 'Clear', danger: true }))) return;
  try { await R.clearHistory(); catchUpEvents(R.st); toast({ level: 'info', title: 'History cleared' }); } catch (e) { errToast(e); } }

/* ---------- pairing ---------- */
$('pairBtn').onclick = async () => { const k = ($('pairInput').value || '').trim(); $('pairErr').textContent = '';
  try { if (/^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(k)) await R.pair(k); else if (!k) throw new Error('Enter your password'); else { try { await R.login(k); } catch (e) { if (e.status === 401 && k.length >= 32) { R.setKey(k); await R.api('GET', '/api/status'); } else throw e; } }
    R.authBad = false; $('pairInput').value = ''; toast({ level: 'win', title: 'Connected' }); await R.refresh(true); R.kick(); }
  catch (e) { if (e.status === 401) R.forget(); $('pairErr').textContent = e.message; } };
$('pairInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('pairBtn').click(); });

/* ---------- render loop ---------- */
function render() { renderHeader();
  if (view === 'mt5') { if (window.ATSMT5) window.ATSMT5.render(); } else if (view === 'home') renderHome(); else if (view === 'bot') renderBot(); else if (view === 'ab') renderAB(); else if (view === 'stats') renderStats(); else if (view === 'history') renderHistory(); else renderSettings(); }
R.on(() => { pumpEvents(R.st); render(); });
window.ATSApp = { go, toast, render, setTheme, openAccount, ask, info, money, esc, I, Form: FormCtl, renderHome: () => { if (view === 'home') renderHome(); } };
function goTo(g) { const [v, a] = String(g || 'home').split(':'); if (['home', 'bot', 'ab', 'mt5', 'stats', 'history', 'settings'].includes(v)) go(v, a); else go('home'); }
{ let g0 = null; try { g0 = new URLSearchParams(location.search).get('go'); if (g0) history.replaceState(null, '', location.pathname); } catch (e) { } goTo(g0 || 'home'); }
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'go') goTo(e.data.go); });
R.kick();
})();
