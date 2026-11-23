/* ATS push alerts (v4.10): Settings > Notifications. Web Push via the ATS server (VAPID public key from GET /api/push). */
(() => {
  const R = window.ATSRemote || window.R, A = () => window.ATSApp; let el = null, info = null, busy = false, err = '';
  const TYPES = [['open', 'Trade opened'], ['result', 'Trade result', 'Win or loss with P/L'], ['limits', 'Targets and stops', 'Session or day target / stop hit'], ['halt', 'Bot halted or errors'], ['mt5', 'MT5 entries and exits'], ['account', 'Account switched']];
  const dev = () => { let d = ''; try { d = localStorage.getItem('ats.devId') || ''; if (!d) { d = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('ats.devId', d); } } catch (e) { d = 'nodev'; } return d; };
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const u8 = b64 => { const p = '='.repeat((4 - b64.length % 4) % 4), s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function sub() { if (!supported) return null; try { const r = await navigator.serviceWorker.ready; return await r.pushManager.getSubscription(); } catch (e) { return null; } }
  async function load() { try { info = await R.api('GET', '/api/push'); } catch (e) { err = e.message; } paint(); }
  async function isOn() { const s = await sub(); return !!(s && info && info.devices && info.devices.some(x => x.dev === dev())); }
  async function enable() { if (busy) return; err = ''; busy = true; paint();
    try { const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (perm !== 'granted') throw new Error(perm === 'denied' ? (ios ? 'Notifications are blocked. Allow them in iPhone Settings > Notifications > ATS.' : 'Notifications are blocked in this browser’s site settings.') : 'Permission was not given');
      if (!info || !info.publicKey) info = await R.api('GET', '/api/push'); if (!info.available || !info.publicKey) throw new Error('Push is not available on the server');
      const reg = await navigator.serviceWorker.ready; let s = await reg.pushManager.getSubscription();
      if (s) { const k = s.options && s.options.applicationServerKey; const cur = k ? btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null; if (cur && cur !== info.publicKey) { await s.unsubscribe(); s = null; } }
      if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(info.publicKey) });
      info = await R.api('POST', '/api/push/subscribe', { device: dev(), subscription: s.toJSON() }); A().toast({ level: 'win', title: 'Alerts on', text: 'Tap Send test to check' });
    } catch (e) { err = e.message || String(e); } busy = false; paint(); }
  async function off() { if (busy) return; err = ''; busy = true; paint();
    try { const s = await sub(); const ep = s && s.endpoint; if (s) await s.unsubscribe().catch(() => { }); info = await R.api('POST', '/api/push/unsubscribe', { device: dev(), endpoint: ep || '' }); A().toast({ level: 'info', title: 'Alerts off on this device' }); }
    catch (e) { err = e.message; } busy = false; paint(); }
  async function test() { if (busy) return; err = ''; busy = true; paint();
    try { const r = await R.api('POST', '/api/push/test', { device: dev() }).catch(e => ({ ok: false, error: e.message })); if (r.devices) info = r;
      if (r.ok) A().toast({ level: 'win', title: 'Test sent', text: 'It should arrive in a few seconds' }); else err = 'Test failed: ' + (r.error || 'unknown error'); }
    catch (e) { err = e.message; } busy = false; paint(); }
  async function save(patch) { try { info = await R.api('POST', '/api/push/settings', patch); } catch (e) { err = e.message; } paint(); }
  async function paint() { if (!el) return; const on = await isOn(), t = (info && info.types) || {}, q = (info && info.quiet) || { on: false, from: '23:00', to: '07:00' };
    const n = info && info.devices ? info.devices.length : 0;
    let status = !supported ? (ios && !standalone ? 'Open ATS from your Home Screen icon to turn on alerts.' : 'This browser can’t receive push alerts.') : !info ? 'Loading…' : !info.available ? 'Push is not set up on the server.' : on ? `On for this device · ${n} device${n === 1 ? '' : 's'}` : (Notification.permission === 'denied' ? (ios ? 'Blocked in iPhone Settings > Notifications > ATS' : 'Blocked in this browser’s site settings') : `Off on this device${n ? ` · ${n} other device${n === 1 ? '' : 's'}` : ''}`);
    const ok = supported && info && info.available;
    el.innerHTML = `<div class="card-h"><h3>Notifications</h3></div>
      <div class="row"><div class="l"><b>Push alerts</b><small>${esc(status)}</small></div>${ok ? (on ? `<button type="button" class="link dn" data-p="off"${busy ? ' disabled' : ''}>Turn off</button>` : `<button type="button" class="link" data-p="on"${busy ? ' disabled' : ''}>Enable</button>`) : ''}</div>
      ${ok && on ? `<div class="row"><div class="l"><b>Send test</b><small>Checks the whole path to this device</small></div><button type="button" class="link" data-p="test"${busy ? ' disabled' : ''}>Send</button></div>` : ''}
      ${err ? `<p class="small" style="color:var(--dn);margin:6px 0 2px">${esc(err)}</p>` : ''}
      ${ok ? TYPES.map(([k, l, s]) => `<div class="row"><div class="l"><b>${l}</b>${s ? `<small>${s}</small>` : ''}</div><label class="switch"><input type="checkbox" data-t="${k}"${t[k] !== false ? ' checked' : ''}><span></span></label></div>`).join('') + `
      <div class="row"><div class="l"><b>Quiet hours</b><small>Trade alerts wait · stops, halts and account changes still come through</small></div><label class="switch"><input type="checkbox" data-q="on"${q.on ? ' checked' : ''}><span></span></label></div>
      ${q.on ? `<div class="row"><div class="l"><b>From – to</b></div><span style="display:flex;gap:6px"><input type="time" class="field" data-q="from" value="${esc(q.from)}" style="width:96px;padding:6px"><input type="time" class="field" data-q="to" value="${esc(q.to)}" style="width:96px;padding:6px"></span></div>` : ''}
      <p class="muted small" style="margin:8px 0 0">Trade alerts are limited to about one per bot per minute.</p>` : ''}`;
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => (b.dataset.p === 'on' ? enable : b.dataset.p === 'off' ? off : test)());
    el.querySelectorAll('[data-t]').forEach(c => c.onchange = () => save({ types: { [c.dataset.t]: c.checked } }));
    el.querySelectorAll('[data-q]').forEach(c => c.onchange = () => save({ quiet: c.dataset.q === 'on' ? { on: c.checked } : { [c.dataset.q]: c.value } })); }
  window.ATSPush = { mount(slot) { if (!slot) return; if (!el) { el = document.createElement('section'); el.className = 'card'; el.id = 'notifCard'; load(); } slot.replaceWith(el); }, dev };
})();
