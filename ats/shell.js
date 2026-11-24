/* Deriv Analyzer app shell (v4.19): ☰ → "Deriv ATS" opens the full ATS inside the same app
 * (kept alive in a layer, so Analyzer bots and ATS keep running while you switch). */
(() => {
  const $ = id => document.getElementById(id);
  const menu = $('appMenu'); if (!menu) return;
  const ai = menu.querySelector('.app-menu-item[data-view="ai"]');
  const item = document.createElement('button'); item.type = 'button'; item.className = 'app-menu-item ats-item'; item.id = 'menuAts';
  item.innerHTML = '<span>Deriv ATS</span><small>Auto trading</small>';
  (ai || menu.querySelector('.app-menu-sep')).insertAdjacentElement(ai ? 'afterend' : 'beforebegin', item);
  const layer = document.createElement('div'); layer.className = 'ats-layer'; layer.id = 'atsLayer'; layer.hidden = true;
  layer.innerHTML = '<iframe id="atsFrame" title="Deriv ATS" allow="clipboard-write"></iframe>'; document.body.appendChild(layer);
  const frame = $('atsFrame');
  const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)'; document.body.appendChild(probe);
  const post = m => { try { frame.contentWindow.postMessage(m, location.origin); } catch (e) { } };
  const insets = () => { const cs = getComputedStyle(probe); post({ type: 'ats:insets', top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 }); };
  const theme = () => (document.body.classList.contains('theme-light') ? 'light' : 'dark');
  try { localStorage.setItem('ats.theme2', theme()); } catch (e) { }
  function closeMenu() { menu.classList.remove('open'); const bd = $('menuBackdrop'); if (bd) bd.classList.remove('open'); }
  function openATS(go) {
    if (!frame.getAttribute('src')) frame.src = './ats.html' + (go ? '?go=' + encodeURIComponent(go) : '');
    else if (go) post({ type: 'go', go });
    layer.hidden = false; document.body.classList.add('ats-open'); closeMenu();
    menu.querySelectorAll('.app-menu-item').forEach(b => b.classList.toggle('active', b === item));
    try { history.replaceState(null, '', location.pathname + '#ats'); } catch (e) { }
  }
  function closeATS() { if (layer.hidden) return; layer.hidden = true; document.body.classList.remove('ats-open'); item.classList.remove('active');
    try { history.replaceState(null, '', location.pathname); } catch (e) { } }
  item.addEventListener('click', () => openATS());
  menu.querySelectorAll('.app-menu-item[data-view]').forEach(b => b.addEventListener('click', closeATS));
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow || !e.data) return; const d = e.data;
    if (d.type === 'ats:ready') { insets(); post({ type: 'ats:theme', theme: theme() }); }
    if (d.type === 'ats:menu') { if (typeof openMenu === 'function') openMenu(); else { menu.classList.add('open'); const bd = $('menuBackdrop'); if (bd) bd.classList.add('open'); } }
    if (d.type === 'ats:theme' && d.theme && d.theme !== theme() && window.setAppTheme) { fromAts = true; window.setAppTheme(d.theme); fromAts = false; }
  });
  let fromAts = false; const _set = window.setAppTheme;
  if (_set) window.setAppTheme = function (t) { _set(t); try { localStorage.setItem('ats.theme2', t); } catch (e) { } if (!fromAts) post({ type: 'ats:theme', theme: t }); };
  window.addEventListener('resize', insets); window.addEventListener('orientationchange', () => setTimeout(insets, 300));
  // service worker (same script URL as ATS so they share one registration) + alert taps
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=22', { scope: './' }).catch(() => { });
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'go') openATS(e.data.go); });
  }
  const q = new URLSearchParams(location.search), go = q.get('go');
  if (go || q.get('ats') || location.hash === '#ats') { try { history.replaceState(null, '', location.pathname); } catch (e) { } openATS(go || ''); }
  window.DerivShell = { openATS, closeATS };
})();
