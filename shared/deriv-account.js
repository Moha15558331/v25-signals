/* Deriv account session for the phone app.
 * A pasted token is stored only in this browser's localStorage.
 * Requests go only to official Deriv hosts. The token is never logged.
 */
(function (global) {
  'use strict';
  const LS_TOKEN = 'v25.deriv.token';
  const LS_MODE = 'v25.deriv.mode';
  const REAL_LOGIN = /^(CR|MF|MX|MLT)\d/i;
  const OFFICIAL_HOST = /^(api\.derivws\.com)$/i;

  const cfg = () => global.V25_DERIV || {};
  const apiBase = () => cfg().API_BASE || 'https://api.derivws.com';
  const appId = () => cfg().APP_ID || '';

  const scrub = (s, token) => {
    let x = String(s == null ? '' : s);
    if (token) x = x.split(token).join('<token>');
    return x.replace(/otp=[^&\s"']+/g, 'otp=<otp>').replace(/pat_[A-Za-z0-9_-]+/g, '<token>');
  };
  const prefix = id => id ? String(id).slice(0, 4) + '…' : null;

  function getStoredToken() { try { return localStorage.getItem(LS_TOKEN) || ''; } catch (e) { return ''; } }
  function setStoredToken(t) {
    try { t ? localStorage.setItem(LS_TOKEN, t) : localStorage.removeItem(LS_TOKEN); } catch (e) {}
  }
  function getStoredMode() {
    try { const m = localStorage.getItem(LS_MODE); if (m === 'real' || m === 'demo') return m; } catch (e) {}
    return 'demo';
  }

  const state = {
    token: getStoredToken(),
    mode: getStoredMode(), // default / fallback is demo
    accounts: { demo: null, real: null },
    connected: false,
    status: 'idle', // idle | connecting | connected | error
    lastError: null
  };

  function isDemoAccount(a) {
    if (!a) return false;
    const t = String(a.account_type || a.type || a.accountType || '').toLowerCase();
    if (t === 'demo' || t === 'virtual') return true;
    if (a.is_demo === true || a.is_virtual === true || a.demo === true) return true;
    const id = String(a.account_id || a.loginid || a.id || '');
    if (/^(VR|DOT|VRTC|DXV)/i.test(id) || /demo/i.test(id)) return true;
    return false;
  }
  function isRealAccount(a) {
    if (!a || isDemoAccount(a)) return false;
    const t = String(a.account_type || a.type || a.accountType || '').toLowerCase();
    if (t === 'real' || t === 'live') return true;
    const id = String(a.account_id || a.loginid || a.id || '');
    if (REAL_LOGIN.test(id) || /^(CR|MF)/i.test(id)) return true;
    return !isDemoAccount(a);
  }
  function accountId(a) {
    if (!a) return null;
    return a.account_id || a.loginid || a.id || a.accountId || a.login_id || null;
  }
  function parseApiError(body, status) {
    if (!body || typeof body !== 'object') return 'HTTP ' + status;
    if (Array.isArray(body.errors) && body.errors.length) {
      const e0 = body.errors[0];
      return (e0 && (e0.message || e0.code)) || JSON.stringify(e0);
    }
    if (body.message) return body.message;
    if (body.error) return typeof body.error === 'string' ? body.error : (body.error.message || JSON.stringify(body.error));
    if (body.msg) return body.msg;
    try { const s = JSON.stringify(body); if (s && s !== '{}') return s.slice(0, 160); } catch (e) {}
    return 'HTTP ' + status;
  }

  function authHeaders() {
    const token = state.token || getStoredToken();
    const h = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
    if (appId()) h['Deriv-App-ID'] = appId();
    return h;
  }

  async function rest(method, path, body) {
    const token = state.token || getStoredToken();
    if (!token) throw new Error('Not connected');
    const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders());
    let r;
    try {
      r = await fetch(apiBase() + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : (method === 'POST' || method === 'PUT' ? '{}' : undefined)
      });
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        throw new Error('Blocked by the browser (CORS/network). This app only talks to api.derivws.com.');
      }
      throw new Error(scrub(msg, token));
    }
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: String(text).slice(0, 180) }; }
    if (!r.ok) {
      const err = new Error(scrub(parseApiError(data, r.status), token));
      err.status = r.status;
      throw err;
    }
    return data;
  }

  function currentAccount() { return state.accounts[state.mode] || null; }
  function setMode(mode) {
    state.mode = mode === 'real' ? 'real' : 'demo';
    try { localStorage.setItem(LS_MODE, state.mode); } catch (e) {}
    return state.mode;
  }

  function snapshot() {
    const acc = currentAccount();
    const id = accountId(acc);
    return {
      status: state.status,
      connected: state.connected,
      mode: state.mode,
      hasToken: !!(state.token || getStoredToken()),
      hasDemo: !!state.accounts.demo,
      hasReal: !!state.accounts.real,
      account: acc,
      account_id: id,
      account_prefix: prefix(id),
      account_type: acc && (isDemoAccount(acc) ? 'demo' : 'real'),
      balance: acc && acc.balance != null ? +acc.balance : null,
      currency: (acc && acc.currency) || 'USD',
      lastError: state.lastError
    };
  }

  async function loadAccounts() {
    const token = state.token || getStoredToken();
    if (!token) {
      state.status = 'idle'; state.connected = false; state.accounts = { demo: null, real: null };
      return snapshot();
    }
    state.token = token;
    state.status = 'connecting';
    try {
      const json = await rest('GET', '/trading/v1/options/accounts');
      const list = (json && (json.data || json.accounts)) || (Array.isArray(json) ? json : []);
      state.accounts.demo = list.find(isDemoAccount) || null;
      state.accounts.real = list.find(isRealAccount) || null;
      // Never treat a non-demo account as demo, even if it is the only one.
      state.connected = !!(state.accounts.demo || state.accounts.real);
      if (!state.connected) {
        state.status = 'error';
        state.lastError = 'No Options accounts listed for this token';
      } else {
        state.status = 'connected';
        state.lastError = null;
        if (state.mode === 'real' && !state.accounts.real) {
          // stay on the Real tab so the user sees "no real account", do not silently trade
        }
        if (state.mode !== 'real') setMode('demo');
      }
      return snapshot();
    } catch (e) {
      state.status = 'error';
      state.connected = false;
      state.lastError = e.message || 'Connect failed';
      if (e.status === 401 || e.status === 403) {
        setStoredToken('');
        state.token = '';
        state.accounts = { demo: null, real: null };
      }
      return snapshot();
    }
  }

  async function connectWithToken(raw) {
    const token = String(raw || '').trim();
    if (!token) { state.status = 'error'; state.lastError = 'Paste a token first'; return snapshot(); }
    state.token = token;
    setStoredToken(token);
    setMode('demo');
    state.status = 'connecting';
    state.lastError = null;
    return loadAccounts();
  }

  function disconnect() {
    setStoredToken('');
    state.token = '';
    state.accounts = { demo: null, real: null };
    state.connected = false;
    state.status = 'idle';
    state.lastError = null;
    setMode('demo');
    return snapshot();
  }

  async function resetDemoBalance() {
    setMode('demo');
    const demo = state.accounts.demo;
    if (!demo) throw new Error('No demo account on this token');
    if (isRealAccount(demo) || !isDemoAccount(demo)) throw new Error('REFUSED: selected account is not demo');
    const id = accountId(demo);
    if (!id) throw new Error('Demo account id missing');
    await rest('POST', '/trading/v1/options/accounts/' + encodeURIComponent(id) + '/reset-demo-balance', {});
    await loadAccounts();
    setMode('demo');
    return snapshot();
  }

  function Session(url) {
    this.url = url; this.id = 1; this.pending = new Map();
  }
  Session.prototype.open = function () {
    const self = this;
    return new Promise((res, rej) => {
      const ws = new WebSocket(self.url); self.ws = ws;
      const to = setTimeout(() => { rej(new Error('Trade socket timeout')); try { ws.close(); } catch (e) {} }, 10000);
      ws.onopen = () => { clearTimeout(to); res(self); };
      ws.onerror = () => { clearTimeout(to); rej(new Error('Trade socket error')); };
      ws.onclose = () => { for (const p of self.pending.values()) p.rej(new Error('Trade socket closed')); self.pending.clear(); };
      ws.onmessage = ev => {
        let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        const p = self.pending.get(d.req_id);
        if (p) {
          self.pending.delete(d.req_id);
          d.error ? p.rej(Object.assign(new Error(scrub(d.error.message || d.error.code, state.token)), { code: d.error.code })) : p.res(d);
        }
      };
    });
  };
  Session.prototype.send = function (req, ms) {
    const self = this;
    return new Promise((res, rej) => {
      const id = self.id++;
      const to = setTimeout(() => { self.pending.delete(id); rej(new Error('timeout ' + Object.keys(req)[0])); }, ms || 15000);
      self.pending.set(id, { res: d => { clearTimeout(to); res(d); }, rej: e => { clearTimeout(to); rej(e); } });
      self.ws.send(JSON.stringify(Object.assign({}, req, { req_id: id })));
    });
  };
  Session.prototype.close = function () { try { this.ws.close(); } catch (e) {} };

  function assertOfficialTradeUrl(url, mode) {
    let u;
    try { u = new URL(url); } catch (e) { throw new Error('OTP response had a bad url'); }
    if (u.protocol !== 'wss:') throw new Error('REFUSED: OTP url is not wss');
    if (!OFFICIAL_HOST.test(u.hostname)) throw new Error('REFUSED: OTP url host is not official Deriv');
    const path = u.pathname;
    if (mode === 'demo') {
      if (!/\/options\/ws\/demo$/.test(path)) throw new Error('REFUSED: OTP url is not the demo endpoint (' + path + ')');
    } else {
      if (/\/options\/ws\/(demo|public)$/.test(path)) throw new Error('REFUSED: expected a real-money socket, got ' + path);
      if (!/\/options\/ws\//.test(path)) throw new Error('REFUSED: unexpected OTP path (' + path + ')');
    }
    return url;
  }

  async function openTradeSession() {
    const acc = currentAccount();
    if (!acc) throw new Error(state.mode === 'real' ? 'No real account on this token' : 'No demo account on this token');
    if (state.mode === 'demo' && !isDemoAccount(acc)) throw new Error('REFUSED: selected account is not demo');
    if (state.mode === 'real' && isDemoAccount(acc)) throw new Error('REFUSED: selected account is demo, not real');
    const id = accountId(acc);
    if (!id) throw new Error('Account id missing');
    const otp = await rest('POST', '/trading/v1/options/accounts/' + encodeURIComponent(id) + '/otp', {});
    const url = otp && (otp.url || otp.ws_url || (otp.data && otp.data.url));
    if (!url) throw new Error('OTP response had no url');
    const safe = assertOfficialTradeUrl(url, state.mode);
    const s = await new Session(safe).open();
    try {
      const b = await s.send({ balance: 1 });
      const lid = b.balance && b.balance.loginid;
      if (state.mode === 'demo' && lid && REAL_LOGIN.test(lid)) {
        s.close();
        throw new Error('REFUSED: balance loginid ' + prefix(lid) + ' looks like a real-money account');
      }
      if (state.mode === 'real' && lid && !REAL_LOGIN.test(lid) && isDemoAccount({ loginid: lid, account_type: 'real' }) === false) {
        // if loginid looks virtual, refuse
        if (/^(VR|DOT|VRTC)/i.test(String(lid))) {
          s.close();
          throw new Error('REFUSED: expected a real-money loginid, got ' + prefix(lid));
        }
      }
      if (b.balance && b.balance.balance != null && acc) acc.balance = +b.balance.balance;
      if (b.balance && b.balance.currency && acc) acc.currency = b.balance.currency;
    } catch (e) { s.close(); throw e; }
    return s;
  }

  async function placeManualTrade({ direction, stake, confirmedReal, symbol }) {
    const side = String(direction || '').toLowerCase();
    const contract_type = (side === 'buy' || side === 'call' || side === 'rise' || side === 'up') ? 'CALL'
      : (side === 'sell' || side === 'put' || side === 'fall' || side === 'down') ? 'PUT' : null;
    if (!contract_type) throw new Error('Choose Rise or Fall');
    stake = +stake;
    if (!(stake >= 0.35)) throw new Error('Stake must be at least $0.35');
    if (state.mode === 'real' && !confirmedReal) throw new Error('Real-money trade needs confirmation');
    const acc = currentAccount();
    if (!acc) throw new Error(state.mode === 'real' ? 'No real account on this token' : 'Connect a demo account first');
    const sym = symbol || cfg().SYMBOL || '1HZ25V';
    const currency = acc.currency || 'USD';
    let s;
    try {
      s = await openTradeSession();
      const p = await s.send({
        proposal: 1, amount: stake, basis: 'stake', contract_type,
        currency, duration: 1, duration_unit: 'h', underlying_symbol: sym
      });
      const pr = p.proposal;
      const buy = await s.send({ buy: pr.id, price: +(+stake).toFixed(2) });
      const b = buy.buy;
      if (acc && b.balance_after != null) acc.balance = +b.balance_after;
      return {
        status: 'open',
        contract_type,
        stake,
        contract_id: b.contract_id,
        buy_price: +b.buy_price,
        payout: +b.payout,
        balance_after: +b.balance_after,
        account_type: state.mode,
        account_prefix: prefix(accountId(acc)),
        mode: state.mode
      };
    } finally {
      if (s) s.close();
    }
  }

  // Restore a saved token on load (does not throw).
  async function boot() {
    if (!getStoredToken()) return snapshot();
    state.token = getStoredToken();
    return loadAccounts();
  }

  global.V25DerivAccount = {
    state, snapshot, boot, loadAccounts, connectWithToken, disconnect,
    setMode, currentAccount, resetDemoBalance, placeManualTrade, openTradeSession,
    isDemoAccount, isRealAccount, accountId, prefix, rest, scrub
  };
})(window);
