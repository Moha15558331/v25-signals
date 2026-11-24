/* Deriv ATS ↔ Deriv Analyzer bridge (v4.19). Adds the ☰ menu to the ATS header; inside the
 * app shell it opens the shared menu, opened on its own it goes back to the Analyzer. */
(() => {
  const inShell = window.parent !== window && (() => { try { return window.parent.location.origin === location.origin; } catch (e) { return false; } })();
  const up = m => { try { window.parent.postMessage(m, location.origin); } catch (e) { } };
  const root = document.documentElement; root.classList.add(inShell ? 'in-shell' : 'no-shell');
  const brand = document.querySelector('.top-inner .brand');
  if (brand) {
    const b = brand.querySelector('b'); if (b) b.innerHTML = 'Deriv <i>ATS</i>';
    const m = document.createElement('button'); m.type = 'button'; m.className = 'shell-menu'; m.setAttribute('aria-label', 'Menu');
    m.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    m.onclick = () => { if (inShell) up({ type: 'ats:menu' }); else location.href = './index.html'; };
    brand.parentNode.insertBefore(m, brand);
  }
  if (!inShell) return;
  let last = root.dataset.theme;
  new MutationObserver(() => { const t = root.dataset.theme; if (t && t !== last) { last = t; up({ type: 'ats:theme', theme: t }); } }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data) return; const d = e.data;
    if (d.type === 'ats:insets') { root.style.setProperty('--sat', (d.top || 0) + 'px'); root.style.setProperty('--sab', (d.bottom || 0) + 'px'); }
    if (d.type === 'ats:theme' && d.theme && d.theme !== root.dataset.theme && window.ATSApp) { last = d.theme; window.ATSApp.setTheme(d.theme); }
    if (d.type === 'go' && d.go && window.ATSApp) { const [v, a] = String(d.go).split(':'); window.ATSApp.go(v, a); }
  });
  up({ type: 'ats:ready' });
})();
