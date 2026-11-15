/* ATS remote: the bot runs 24/7 on Mohamed's server; this app is the remote control and dashboard.
 * The API key arrives once through a one-time pairing code (or is pasted) and is kept only in this phone's localStorage. */
(() => {
'use strict';
const DEF_URL = 'https://ats.2-29-170-227.sslip.io';
const LS = { key: 'ats.server.key', url: 'ats.server.url' };
const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const set = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { } };
const R = {
  st: null, hist: null, stats: null, err: null, lastOk: 0, busy: false, histAt: 0, statsAt: 0, listeners: [],
  url() { return (get(LS.url) || DEF_URL).replace(/\/+$/, ''); },
  hasKey() { return !!get(LS.key); },
  key() { return get(LS.key); },
  setKey(k) { set(LS.key, (k || '').trim()); this.st = null; this.hist = null; this.stats = null; this.err = null; },
  forget() { set(LS.key, ''); this.st = null; this.hist = null; this.stats = null; },
  on(fn) { this.listeners.push(fn); },
  changed() { for (const f of this.listeners) try { f(this); } catch (e) { console.error(e); } },
  async api(method, path, body) {
    const key = get(LS.key); if (!key) throw new Error('No server key saved');
    let r, d;
    try { r = await fetch(this.url() + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + key }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined }); }
    catch (e) { throw new Error('Server unreachable — check your internet'); }
    try { d = await r.json(); } catch (e) { d = null; }
    if (!r.ok || !d || d.ok === false) throw Object.assign(new Error((d && d.error) || ('Server error ' + r.status)), { status: r.status });
    return d;
  },
  async pair(code) {
    let r, d; try { r = await fetch(this.url() + '/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }), cache: 'no-store' }); d = await r.json().catch(() => null); }
    catch (e) { throw new Error('Server unreachable — check your internet'); }
    if (!r.ok || !d || !d.key) throw new Error((d && d.error) || 'Pairing failed'); this.setKey(d.key); return true;
  },
  async refresh(full) {
    if (!this.hasKey()) { this.changed(); return; }
    try { const s = await this.api('GET', '/api/status'); this.st = s; this.err = null; this.lastOk = Date.now();
      if (full || !this.hist || Date.now() - this.histAt > 15000) { this.hist = await this.api('GET', '/api/history?limit=500'); this.histAt = Date.now(); }
      if (full || !this.stats || Date.now() - this.statsAt > 20000) { this.stats = await this.api('GET', '/api/stats'); this.statsAt = Date.now(); }
    } catch (e) { this.err = e.message; if (e.status === 401) this.authBad = true; }
    this.changed();
  },
  kick() { clearTimeout(this._t); const loop = async () => { if (!document.hidden && this.hasKey()) await this.refresh(); this._t = setTimeout(loop, this.st && (this.st.bot.running || this.st.bot.open) ? 2500 : 6000); }; loop(); },
  async act(method, path, body) { this.busy = true; this.changed();
    try { const d = await this.api(method, path, body); if (d.status) this.st = d.status; await this.refresh(true); return d; } finally { this.busy = false; this.changed(); } },
  start() { return this.act('POST', '/api/bot/start'); },
  stop() { return this.act('POST', '/api/bot/stop'); },
  saveParams(params) { return this.act('PUT', '/api/settings', { params }); },
  saveGlobal(g) { return this.act('PUT', '/api/settings', { global: g }); },
  newSession() { return this.act('POST', '/api/session/new'); },
  realOn() { return this.act('POST', '/api/real', { enable: true, confirm: true, key: get(LS.key) }); },
  realOff() { return this.act('POST', '/api/real', { enable: false }); },
  realCap(cap, confirm) { return this.act('POST', '/api/real', { lifetime_cap: cap, confirm: confirm ? true : undefined }); },
  resetDemo() { return this.act('POST', '/api/demo/reset'); },
  resetToday() { return this.act('POST', '/api/day/reset'); },
  clearHistory() { return this.act('POST', '/api/history/clear'); },
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) R.kick(); });
window.ATSRemote = R;
})();
