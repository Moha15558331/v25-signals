/* ATS app shell: account connect panel (token stays in this phone's localStorage), side menu, theme.
 * The bot runner lives in ats.js. */
(() => {
'use strict';
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(err => console.warn('SW register failed', err)));
const C = window.V25Core, DA = window.V25DerivAccount;
const $ = id => document.getElementById(id);
const toast = (msg, ms = 3400) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms); };

// public market-data socket (candles for the analysis model)
const client = new C.DerivClient({ onStatus: s => { document.body.dataset.feed = s; } });
client.connect();

// ---------- side menu ----------
function openMenu() { $('appMenu').classList.add('open'); $('menuBackdrop').classList.add('open'); $('appMenu').setAttribute('aria-hidden', 'false'); }
function closeMenu() { $('appMenu').classList.remove('open'); $('menuBackdrop').classList.remove('open'); $('appMenu').setAttribute('aria-hidden', 'true'); }
$('menuBtn').onclick = openMenu; $('menuCloseBtn').onclick = closeMenu; $('menuBackdrop').onclick = closeMenu;
document.querySelectorAll('.app-menu-item[data-go]').forEach(b => b.onclick = () => {
  closeMenu(); const go = b.dataset.go; const A = window.ATS; if (!A) return;
  document.querySelectorAll('.app-menu-item[data-go]').forEach(x => x.classList.toggle('active', x === b));
  if (go.startsWith('bot:')) A.openBotView(go.slice(4)); else { A.closeBotView(); A.setView(go === 'history' ? 'history' : 'bots'); window.scrollTo({ top: 0 }); }
});
function setTheme(t) { t = t === 'light' ? 'light' : 'dark'; document.body.classList.toggle('theme-light', t === 'light'); document.body.classList.toggle('theme-dark', t === 'dark');
  document.querySelectorAll('.theme-opt').forEach(b => b.classList.toggle('active', b.dataset.theme === t));
  document.querySelector('meta[name=theme-color]').setAttribute('content', t === 'light' ? '#eef1f6' : '#0a0e17');
  try { localStorage.setItem('ats.theme', t); } catch (e) { } }
document.querySelectorAll('.theme-opt').forEach(b => b.onclick = () => setTheme(b.dataset.theme));
setTheme(localStorage.getItem('ats.theme') || 'dark');

// ---------- account panel (same flow as V25 Signals) ----------
const WALLET_SVG = '<svg class="wallet-svg" viewBox="0 0 24 24"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5z"/><path d="M16 12h.01"/></svg>';
function setWalletStatus(msg, type) { const el = $('wStatus'); el.textContent = msg || ''; el.className = 'wallet-status' + (type ? ' ' + type : ''); }
function openWallet() { const d = $('walletDrop'); d.hidden = false; d.classList.add('open'); renderWallet();
  if (!DA.snapshot().hasToken) setTimeout(() => $('wTokenInput').focus(), 50); else DA.loadAccounts().then(renderWallet); }
function closeWallet() { const d = $('walletDrop'); d.classList.remove('open'); d.hidden = true; }
function renderWallet() {
  const s = DA.snapshot(), pill = $('walletPill'), drop = $('walletDrop');
  $('realBanner').hidden = !(s.connected && s.mode === 'real');
  const isOpen = drop.classList.contains('open');
  drop.className = 'wallet-drop' + (isOpen ? ' open' : '') + (s.connected ? ' ' + s.mode : ''); drop.hidden = !isOpen;
  if (!s.connected) {
    pill.className = 'wallet-pill connect'; pill.innerHTML = '<span>Connect</span>';
    $('wTokenSection').hidden = false; $('wAccountSection').hidden = true;
    if (s.status === 'connecting') setWalletStatus('Connecting…'); else if (s.status === 'error' && s.lastError) setWalletStatus(s.lastError, 'err'); else if (!s.hasToken) setWalletStatus('');
  } else {
    const bal = s.balance == null ? '—' : Number(s.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); const cur = s.currency || 'USD';
    pill.className = 'wallet-pill ' + s.mode;
    pill.innerHTML = `<span class="wallet-icon-box">${WALLET_SVG}</span><span class="wallet-text"><span class="wallet-bal">${bal}</span><span class="wallet-mode">${s.mode} · ${cur}</span></span>`;
    $('wTokenSection').hidden = true; $('wAccountSection').hidden = false;
    $('wBalance').innerHTML = s.balance == null ? '—' : bal + '<span style="font-size:1.6rem;font-weight:800"> ' + cur + '</span>';
    $('wCurrency').textContent = '';
    $('wAccountId').textContent = s.account_prefix ? ('ID: ' + s.account_prefix) : (s.mode === 'real' && !s.hasReal ? 'No real account on this token' : '—');
    $('wBtnDemo').classList.toggle('active', s.mode === 'demo'); $('wBtnReal').classList.toggle('active', s.mode === 'real');
    const showReset = s.mode === 'demo' && s.hasDemo; $('wResetBtn').style.display = showReset ? '' : 'none'; $('wResetBtn').disabled = !showReset || $('wResetBtn').dataset.busy === '1';
    if (s.status === 'connecting') setWalletStatus('Loading…'); else if (s.lastError) setWalletStatus(s.lastError, 'err');
    else if (s.mode === 'real' && !s.hasReal) setWalletStatus('No real account on this token', 'err'); else setWalletStatus('Connected', 'ok');
  }
  if (window.ATS) window.ATS.render();
}
const running = () => window.ATS && Object.values(window.ATS.BOTS).some(b => b.running || b.open);
$('walletPill').onclick = e => { e.stopPropagation(); openWallet(); };
$('wCloseBtn').onclick = e => { e.stopPropagation(); closeWallet(); };
$('walletDrop').onclick = e => { if (e.target === $('walletDrop')) closeWallet(); };
$('walletDrop').querySelector('.wallet-panel').onclick = e => e.stopPropagation();
$('wTokenConnectBtn').onclick = async e => { e.stopPropagation(); const raw = ($('wTokenInput').value || '').trim(); if (!raw) { setWalletStatus('Paste a token first', 'err'); return; }
  setWalletStatus('Connecting…'); const s = await DA.connectWithToken(raw); $('wTokenInput').value = ''; renderWallet();
  if (s.connected) { setWalletStatus('Connected', 'ok'); toast('Demo account connected'); } else setWalletStatus(s.lastError || 'Connect failed', 'err'); };
$('wTokenInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('wTokenConnectBtn').click(); } });
$('wBtnDemo').onclick = () => { if (DA.state.mode !== 'demo' && running() && !confirm('Switching account stops every running bot. Continue?')) return; DA.setMode('demo'); renderWallet(); };
$('wBtnReal').onclick = () => { if (DA.state.mode === 'real') return;
  if (running() && !confirm('Switching account stops every running bot. Continue?')) return;
  if (!confirm('Switch to your REAL account? Bots started from now on would trade real money (each still asks before it starts).')) return;
  DA.setMode('real'); renderWallet(); };
$('wLogoutBtn').onclick = () => { if (running()) { toast('Stop all bots before disconnecting'); return; } DA.disconnect(); renderWallet(); closeWallet(); toast('Disconnected. Token removed from this phone.'); };
$('wResetBtn').onclick = async e => { e.preventDefault(); e.stopPropagation(); const btn = $('wResetBtn'); if (btn.dataset.busy === '1') return;
  if (!confirm('Reset the Deriv demo balance back to the default ($10,000)?')) return;
  btn.dataset.busy = '1'; btn.disabled = true; setWalletStatus('Resetting…');
  try { await DA.resetDemoBalance(); setWalletStatus('Demo balance reset to default', 'ok'); toast('Demo balance reset'); }
  catch (err) { setWalletStatus('Reset failed: ' + (err.message || err), 'err'); }
  finally { btn.dataset.busy = '0'; renderWallet(); } };
async function bootWallet() { renderWallet(); await DA.boot(); renderWallet();
  setInterval(() => { if (DA.snapshot().hasToken) DA.loadAccounts().then(renderWallet); }, 20000); }

window.__v25 = { client, toast, C, renderWallet };
bootWallet();
})();
