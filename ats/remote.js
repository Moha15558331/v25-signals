/* ATS Server mode: the bot runs 24/7 on Mohamed's server (DEMO ONLY); this phone is the remote control and dashboard.
 * The API key is entered once in Account → Server and kept only in this phone's localStorage. */
(() => {
'use strict';
const DEF_URL = 'https://ats.2-29-170-227.sslip.io';
const LS = { key: 'ats.server.key', url: 'ats.server.url', mode: 'ats.mode' };
const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const set = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { } };
const R = {
  st: null, hist: null, err: null, lastOk: 0, busy: false, draft: null, histAt: 0,
  url() { return (get(LS.url) || DEF_URL).replace(/\/+$/, ''); },
  hasKey() { return !!get(LS.key); },
  mode() { const m = get(LS.mode); return m === 'local' ? 'local' : m === 'server' ? 'server' : (this.hasKey() ? 'server' : 'local'); },
  on() { return this.mode() === 'server' && this.hasKey(); },
  setMode(m) { set(LS.mode, m === 'local' ? 'local' : 'server'); this.st = null; this.hist = null; this.draft = null; this.err = null; this.kick(); },
  setKey(k) { set(LS.key, (k || '').trim()); if (k) set(LS.mode, 'server'); this.st = null; this.hist = null; this.draft = null; this.err = null; },
  forget() { set(LS.key, ''); set(LS.mode, 'local'); this.st = null; this.hist = null; this.draft = null; },
  async api(method, path, body) {
    const key = get(LS.key); if (!key) throw new Error('No server key saved');
    let r, d;
    try { r = await fetch(this.url() + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + key }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined }); }
    catch (e) { throw new Error('Server unreachable — check your internet'); }
    try { d = await r.json(); } catch (e) { d = null; }
    if (!r.ok || !d || d.ok === false) throw Object.assign(new Error((d && d.error) || ('Server error ' + r.status)), { status: r.status });
    return d;
  },
  changed() { if (window.ATS) window.ATS.render(); if (window.__v25 && window.__v25.renderWallet) window.__v25.renderWallet(); },
  async refresh(withHist) {
    if (!this.on()) return;
    try { const s = await this.api('GET', '/api/status'); this.st = s; this.err = null; this.lastOk = Date.now();
      if (!this.draft || s.bot.running || s.bot.open) this.draft = Object.assign({}, s.bot.params);
      if (withHist || !this.hist || Date.now() - this.histAt > 15000) { this.hist = await this.api('GET', '/api/history?limit=300'); this.histAt = Date.now(); }
    } catch (e) { this.err = e.message; }
    this.changed();
  },
  kick() { clearTimeout(this._t); const loop = async () => { if (!document.hidden && this.on()) await this.refresh(); this._t = setTimeout(loop, this.st && (this.st.bot.running || this.st.bot.open) ? 3000 : 6000); }; loop(); },
  async act(method, path, body) { this.busy = true; this.changed();
    try { const d = await this.api(method, path, body); if (d.status) this.st = d.status; await this.refresh(true); return d; } finally { this.busy = false; this.changed(); } },
  start: async function () { await this.api('PUT', '/api/settings', { params: this.draft }); return this.act('POST', '/api/bot/start'); },
  stop() { return this.act('POST', '/api/bot/stop'); },
  stopAll() { return this.act('POST', '/api/stop-all'); },
  saveGlobal(g) { return this.act('PUT', '/api/settings', { global: g }); },
  newSession() { return this.act('POST', '/api/session/new'); },
  async pushDraft() { try { await this.api('PUT', '/api/settings', { params: this.draft }); return null; } catch (e) { return e.message; } },
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) R.kick(); });
window.ATSRemote = R;
R.kick();
})();
