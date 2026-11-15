/* V25 Signals: browser app. Public market data only. Never holds a token, never trades.
 * Demo-account trading runs server-side in the box logger; this app only reads its sanitized data/demo.json. */
(() => {
'use strict';
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW register failed', err)));
const C = window.V25Core, LC = window.LightweightCharts;
const $ = id => document.getElementById(id);
const LS = { log: 'v25.log', cfg: 'v25.cfg' };
const PAPER_DEFAULT = { balance: 50, stake: 1, payout: 95 };
const cfg = Object.assign({ symbol: '1HZ25V', tf: '15m', showBoot: false }, PAPER_DEFAULT, JSON.parse(localStorage.getItem(LS.cfg) || '{}'));
const saveCfg = () => localStorage.setItem(LS.cfg, JSON.stringify(cfg));
let LOG = JSON.parse(localStorage.getItem(LS.log) || '[]');
const saveLog = () => localStorage.setItem(LS.log, JSON.stringify(LOG));
const S = { last: null, prevDay: null, tickTimes: [], candles: {}, current: null, chartCandles: [], snapshot: null, levels: [], demo: null };
const fmt = (x, d = 2) => x == null || isNaN(x) ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = x => x == null ? '—' : (x * 100).toFixed(1) + '%';
const money = (x, sign) => x == null ? '—' : (sign && x > 0 ? '+' : x < 0 ? '−' : '') + '$' + fmt(Math.abs(x));
const bh = iso => iso ? C.fmtBahrain(Math.floor(Date.parse(iso) / 1000)).slice(5, 16) : '—';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
window.__app = S; // for headless tests
const toast = (msg, ms = 3200) => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms); };
const ICON = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  dn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  neu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg>' };

// ---------- tabs ----------
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  window.scrollTo({ top: 0 });
  if (b.dataset.tab === 'chart') chart.timeScale().fitContent(); if (b.dataset.tab === 'stats') renderStats(); if (b.dataset.tab === 'signal') loadDemo(); });
// ---------- details sheet ----------
function openSheet() { $('scrim').hidden = false; requestAnimationFrame(() => { $('scrim').classList.add('show'); $('sheet').classList.add('open'); }); $('sheet').setAttribute('aria-hidden', 'false'); renderTable(); }
function closeSheet() { $('scrim').classList.remove('show'); $('sheet').classList.remove('open'); $('sheet').setAttribute('aria-hidden', 'true'); setTimeout(() => $('scrim').hidden = true, 260); }
$('openDetails').onclick = openSheet; $('symBtn').onclick = openSheet; $('closeDetails').onclick = closeSheet; $('scrim').onclick = closeSheet;
// ---------- iOS add-to-home-screen tip ----------
(function () { const tip = $('installTip'); const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isIOS && !standalone && !localStorage.getItem('v25.hideInstall')) tip.hidden = false;
  $('dismissInstall').onclick = () => { localStorage.setItem('v25.hideInstall', '1'); tip.hidden = true; }; })();
// ---------- symbol ----------
for (const [k, v] of Object.entries(C.SYMBOLS)) $('symbol').add(new Option(`${v} (${k})`, k));
$('symbol').value = cfg.symbol; $('symName').textContent = C.SYMBOLS[cfg.symbol] || cfg.symbol;
$('symbol').onchange = () => { cfg.symbol = $('symbol').value; saveCfg(); location.reload(); };
// ---------- clock + countdown ----------
function tickClock() { const ep = Math.floor(Date.now() / 1000); $('clock').textContent = C.fmtBahrain(ep).slice(11, 16) + ' Bahrain';
  const now = Date.now(); S.tickTimes = S.tickTimes.filter(t => now - t < 10000);
  $('rate').textContent = (S.tickTimes.length / 10).toFixed(1) + ' ticks/s · ' + (client.url || '').replace('wss://', '').split('/')[0];
  const next = (Math.floor(ep / 3600) + 1) * 3600, left = next - ep;
  $('countdown').textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
  $('nextAt').textContent = C.fmtBahrain(next).slice(11, 16) + ' Bahrain · 1h Rise/Fall'; }
setInterval(tickClock, 1000);

// ---------- chart ----------
const chart = LC.createChart($('chart'), { layout: { attributionLogo: false, background: { color: '#121418' }, textColor: '#8b929c', fontFamily: '-apple-system,BlinkMacSystemFont,Inter,sans-serif' },
  grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
  timeScale: { timeVisible: true, secondsVisible: false, borderVisible: false }, rightPriceScale: { borderVisible: false }, crosshair: { mode: 0 },
  localization: { timeFormatter: t => C.fmtBahrain(t).slice(5, 16) } });
const series = chart.addCandlestickSeries({ upColor: '#2ebd85', downColor: '#f6465d', wickUpColor: '#2ebd85', wickDownColor: '#f6465d', borderVisible: false });
new ResizeObserver(() => chart.applyOptions({ width: $('chart').clientWidth, height: $('chart').clientHeight })).observe($('chart'));
const TFS = ['1d', '4h', '1h', '15m', '5m', '1m'];
TFS.forEach(tf => { const b = document.createElement('button'); b.type = 'button'; b.textContent = tf.toUpperCase(); b.dataset.tf = tf; b.onclick = () => loadTF(tf); $('tfbar').appendChild(b); });
let lines = [];
function drawSR() { lines.forEach(l => series.removePriceLine(l)); lines = [];
  const c = S.chartCandles; if (c.length < 30) return; const last = c.at(-1).close;
  const lv = C.srLevels(c, { max: 12 }).sort((a, b) => Math.abs(a.price - last) - Math.abs(b.price - last)).slice(0, 6);
  S.levels = lv;
  lv.forEach(l => lines.push(series.createPriceLine({ price: l.price, color: l.price > last ? 'rgba(246,70,93,.75)' : 'rgba(46,189,133,.75)', lineWidth: l.strength === 'strong' ? 2 : 1, lineStyle: l.strength === 'weak' ? 2 : 0,
    axisLabelVisible: true, title: `${l.price > last ? 'R' : 'S'} ×${l.touches}` })));
  const p = S.pred; if (p) { const col = p.direction === 'buy' ? '#2ebd85' : p.direction === 'sell' ? '#f6465d' : '#7b8cff';
    lines.push(series.createPriceLine({ price: p.target_zone.high, color: '#7b8cff', lineStyle: 1, lineWidth: 1, axisLabelVisible: false, title: '' }));
    lines.push(series.createPriceLine({ price: p.target_zone.low, color: '#7b8cff', lineStyle: 1, lineWidth: 1, axisLabelVisible: false, title: '' }));
    series.setMarkers([{ time: c.at(-1).epoch, position: p.direction === 'sell' ? 'aboveBar' : 'belowBar', color: col,
      shape: p.direction === 'buy' ? 'arrowUp' : p.direction === 'sell' ? 'arrowDown' : 'circle', text: p.direction === 'neutral' ? 'Neutral' : (p.direction === 'buy' ? 'Up' : 'Down') + ' 1h' }]); }
  $('srlegend').textContent = `${lv.length} nearest levels on ${cfg.tf.toUpperCase()} · ×N = touches · Bahrain time`; }
async function loadTF(tf) { cfg.tf = tf; saveCfg(); document.querySelectorAll('#tfbar button').forEach(b => b.classList.toggle('on', b.dataset.tf === tf));
  try { S.chartCandles = await client.candles(cfg.symbol, tf, 1000); } catch (e) { console.warn('candles', e && e.message); return; }
  series.setData(S.chartCandles.map(c => ({ time: c.epoch, open: c.open, high: c.high, low: c.low, close: c.close }))); drawSR(); chart.timeScale().fitContent();
  chart.timeScale().setVisibleLogicalRange({ from: S.chartCandles.length - 120, to: S.chartCandles.length + 4 }); }
function onTickChart(q, ep) { const g = C.TF[cfg.tf], c = S.chartCandles; if (!c.length) return; const b = Math.floor(ep / g) * g; let last = c.at(-1);
  if (b > last.epoch) { last = { epoch: b, open: q, high: q, low: q, close: q }; c.push(last); drawSR(); } else if (b === last.epoch) { last.close = q; last.high = Math.max(last.high, q); last.low = Math.min(last.low, q); } else return;
  series.update({ time: last.epoch, open: last.open, high: last.high, low: last.low, close: last.close }); }

// ---------- connection ----------
const STATUS_LABEL = { open: 'Live', connecting: 'Connecting', reconnecting: 'Reconnecting', closed: 'Offline' };
const client = new C.DerivClient({ onStatus: (s) => { $('conn').textContent = STATUS_LABEL[s] || s; $('dot').className = 'dot ' + (s === 'open' ? 'ok' : s === 'connecting' || s === 'reconnecting' ? 'wait' : ''); S.status = s; } });
async function start() { await client.connect();
  client.subscribe('tick', { ticks: cfg.symbol }, d => { const t = d.tick; S.last = { quote: +t.quote, epoch: +t.epoch }; S.tickTimes.push(Date.now()); S.ticks = (S.ticks || 0) + 1;
    $('px').textContent = fmt(t.quote, t.pip_size);
    if (S.prevDay) { const ch = (t.quote - S.prevDay) / S.prevDay * 100; $('chg').textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '% · 24h'; $('chg').className = 'chip ' + (ch >= 0 ? 'up' : 'dn'); }
    onTickChart(+t.quote, +t.epoch); });
  loadTF(cfg.tf); await refreshPrediction(); setInterval(refreshPrediction, 60000); setInterval(gradeOpen, 30000); gradeOpen(); syncBox(true); loadDemo(); setInterval(loadDemo, 60000); }

// ---------- prediction ----------
async function refreshPrediction() { try { S.snapshot = await client.snapshot(cfg.symbol); const m1 = S.snapshot['1m']; S.prevDay = m1[Math.max(0, m1.length - 1440)].open;
  const price = S.last ? S.last.quote : m1.at(-1).close; const epoch = S.last ? S.last.epoch : m1.at(-1).epoch;
  S.pred = C.predict({ symbol: cfg.symbol, candles: S.snapshot, price, epoch }, { signal_type: 'manual', source: 'browser', stats: C.stats(allLog()) }); renderSignal(); drawSR(); }
  catch (e) { console.warn('predict', e && e.message); $('sigcard').innerHTML = `<div class="muted">Prediction unavailable: ${esc(e.message || 'network')}. Retrying in a minute.</div>`; } }
function renderSignal() { const p = S.pred; const cls = p.direction === 'buy' ? 'up' : p.direction === 'sell' ? 'dn' : 'neu';
  const label = p.direction === 'buy' ? 'Up' : p.direction === 'sell' ? 'Down' : 'Neutral';
  const edge = p.edge_status && p.edge_status !== 'untested';
  $('sigcard').innerHTML = `<div class="dir-top"><div class="dir-icon ${cls}">${ICON[cls]}</div><div><div class="dir-label ${cls}">${label}</div>
      <div class="dir-sub">${p.direction === 'neutral' ? 'No clear edge right now · no trade' : (p.direction === 'buy' ? 'Rise' : 'Fall') + ' · 1 hour · ' + p.confidence + '% model score'}</div></div></div>
    <span class="badge ${edge ? 'edge' : 'untested'}">${edge ? '✓ ' + esc(p.edge_status) : 'Untested · no proven edge'}</span>
    <div class="kv"><div><span class="eyebrow">Entry</span><b>${fmt(p.price_at_signal)}</b></div><div><span class="eyebrow">Expires</span><b>${p.due_bahrain.slice(11, 16)}</b></div>
      <div class="wide"><span class="eyebrow">Target zone</span><b>${fmt(p.target_zone.low)} – ${fmt(p.target_zone.high)}</b></div></div>`;
  $('reasons').innerHTML = p.reasons.map(r => `<li>${esc(r)}</li>`).join('');
  $('votes').innerHTML = Object.entries(p.votes).map(([k, v]) => { const w = Math.abs(v) * 50; return `<div class="vote"><span>${k} <small class="muted">${C.WEIGHTS[k]}</small></span><div class="bar"><i style="left:${v >= 0 ? 50 : 50 - w}%;width:${w}%;background:${v >= 0 ? 'var(--up)' : 'var(--dn)'}"></i></div><b>${v > 0 ? '+' : ''}${v}</b></div>`; }).join('');
  $('scoreLine').textContent = `Score ${p.score} (neutral if |score| < ${C.DEAD_ZONE}) · regime ${p.regime.label} · nearest ${p.sr.nearest_type} ${fmt(p.sr.nearest_level)} (${p.sr.distance_atr}×ATR, ${p.sr.zone}). Live preview, refreshed every minute; the box logger logs one call on every hour.`;
  const I = p.indicators; $('inds').innerHTML = `<div class="ikv"><span>EMA 20/50/200 (1h)</span><b>${fmt(I.ema20)} / ${fmt(I.ema50)} / ${fmt(I.ema200)}</b><span>RSI 14</span><b>${I.rsi14}</b>
    <span>MACD hist</span><b>${I.macd_hist} (prev ${I.macd_hist_prev})</b><span>BB %B / width</span><b>${I.bb_pctb} / ${I.bb_width}${I.bb_squeeze ? ' · squeeze' : ''}</b><span>ATR 14 (1h)</span><b>${fmt(I.atr14_1h)}</b>
    <span>Regime</span><b>${p.regime.label} (RV ${p.regime.rv_ann_pct}% vs ${p.regime.rv_avg_ann_pct}%)</b></div>`; }
$('predictNow').onclick = async () => { const b = $('predictNow'); b.disabled = true; await refreshPrediction(); if (S.pred) { const s = JSON.parse(JSON.stringify(S.pred)); s.id = s.id.replace(/-m/, '-M'); LOG.push(s); saveLog(); renderStats();
  toast(`Logged ${s.direction === 'neutral' ? 'Neutral' : s.direction === 'buy' ? 'Up' : 'Down'} @ ${fmt(s.price_at_signal)} · graded ${s.due_bahrain.slice(11, 16)}`); } setTimeout(() => b.disabled = false, 2000); };
async function gradeOpen() { const now = Date.now() / 1000; let ch = false;
  for (const s of LOG.filter(x => x.status === 'open' && x.due_epoch <= now - 3)) { try { const p = await client.priceAt(s.symbol, s.due_epoch); C.grade(s, p.price, p.epoch); ch = true; } catch (e) { } }
  if (ch) { saveLog(); renderStats(); } }

// ---------- demo account (read-only view of the box logger's sanitized status) ----------
async function loadDemo() { try { const r = await fetch('data/demo.json', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); S.demo = await r.json(); } catch (e) { S.demo = S.demo || null; } renderDemo(); }
function renderDemo() { const d = S.demo; const pill = $('demoPill');
  if (!d) { pill.textContent = 'Not connected'; pill.className = 'pill'; $('demoGuards').textContent = 'Demo status not published yet.'; return; }
  const ok = d.connected && d.verified_demo;
  pill.textContent = ok ? `Connected · Demo ${d.account_prefix || ''}` : d.configured ? 'Setup pending' : 'Not connected'; pill.className = 'pill ' + (ok ? 'ok' : d.configured ? 'warn' : '');
  $('demoBal').textContent = d.balance == null ? '—' : money(d.balance) + (d.currency && d.currency !== 'USD' ? ' ' + d.currency : '');
  $('demoToday').textContent = money(d.today_pnl, true); $('demoToday').className = d.today_pnl > 0 ? 'up' : d.today_pnl < 0 ? 'dn' : '';
  $('demoOpen').textContent = (d.open_trades || []).length; $('demoSettled').textContent = d.totals ? `${d.totals.wins}/${d.totals.settled}` : '—';
  const rec = (d.recent || []).filter(t => t.status !== 'skipped').slice(0, 4);
  $('demoTrades').innerHTML = rec.length ? rec.map(t => `<li><div>${t.contract_type === 'CALL' ? 'Rise' : 'Fall'} · $${fmt(t.stake)}${t.test ? ' <small style="display:inline">test</small>' : ''}<small>${bh(t.placed_utc)} Bahrain · #${t.contract_id || '—'}</small></div>
    <b class="${t.result === 'win' ? 'up' : t.result === 'loss' ? 'dn' : 'muted'}">${t.status === 'settled' ? money(t.profit, true) : t.status === 'open' ? 'Open' : t.status}</b></li>`).join('') : '';
  $('demoGuards').textContent = `Auto-trades each on-time hourly Up/Down call · $${fmt(d.stake)} stake · max ${d.max_open} open · daily loss cap $${fmt(d.daily_loss_cap)}${d.kill_switch ? ' · KILL SWITCH ON' : ''}${d.enabled ? '' : ' · paused'} · updated ${bh(d.updated_utc).slice(6)} Bahrain`;
  const err = d.last_reset && d.last_reset.ok === false ? 'Last reset refused by Deriv: ' + d.last_reset.message : (!ok && d.configured ? (/App-ID|App ID/i.test(d.last_error || '') ? 'Token received. Waiting for a Deriv App ID to finish connecting; no trades until then.' : (d.last_error || '').replace(/^\w+: /, '')) : '');
  $('demoErr').hidden = !err; $('demoErr').textContent = err; }
$('resetDemo').onclick = () => {
  if (!confirm('Reset balances?\n\n• This app\'s paper balance goes back to $' + PAPER_DEFAULT.balance + ' right away.\n• The Deriv demo balance ($10,000 default) is reset from the box, because this phone app never holds your Deriv token. Ask in chat: "reset my demo balance".')) return;
  Object.assign(cfg, PAPER_DEFAULT); saveCfg(); renderStats();
  toast('Paper balance reset to $' + PAPER_DEFAULT.balance + '. For the Deriv demo balance, ask in chat: "reset my demo balance".', 6000); };

// ---------- stats ----------
const allLog = () => LOG.filter(x => x.symbol === cfg.symbol);
function sliceBlock(title, obj, open) { const rows = Object.entries(obj); if (!rows.length) return '';
  return `<details class="card fold slice"${open ? ' open' : ''}><summary>${title}<span class="muted sm" style="margin-left:auto;margin-right:12px;font-weight:500">${rows.length}</span></summary><div>${rows.map(([k, s]) =>
    `<div class="srow"><div>${esc(k)}<div class="n">n=${s.n} · ${s.wins}–${s.losses} · CI ${pct(s.ci_low)}–${pct(s.ci_high)}</div></div><span class="tag ${s.edge_candidate ? 'edge' : ''}">${s.edge_candidate ? 'edge?' : s.n < C.EDGE.minN ? 'need ' + (C.EDGE.minN - s.n) : 'no edge'}</span><b class="${s.rate > 0.5 ? 'win' : s.rate < 0.5 ? 'loss' : ''}">${pct(s.rate)}</b></div>`).join('')}</div></details>`; }
function renderStats() { const log = allLog(); const st = C.stats(log); const o = st.overall;
  const status = o.edge_candidate ? '<span class="badge edge">Edge candidate · confirm on new data</span>' : o.n < C.EDGE.minN ? `<span class="badge untested">Untested · ${C.EDGE.minN - o.n} more graded calls needed</span>` : '<span class="badge untested">No proven edge</span>';
  $('overall').innerHTML = `<div class="eyebrow">Hit rate · graded hourly &amp; manual calls</div><div class="rate ${o.n ? (o.rate > 0.5 ? 'win' : o.rate < 0.5 ? 'loss' : '') : 'muted'}">${o.n ? pct(o.rate) : '—'}</div>
    <div class="meter"><i style="width:${o.n ? Math.round(o.rate * 100) : 0}%"></i></div><div class="meter-lbl"><span>0%</span><span>50% coin flip</span><span>100%</span></div>
    <div class="hero-grid"><div><span class="eyebrow">Graded</span><b>${o.n}</b></div><div><span class="eyebrow">Won–lost</span><b>${o.wins}–${o.losses}</b></div><div><span class="eyebrow">p vs 50%</span><b>${o.n ? o.p_value.toFixed(2) : '—'}</b></div></div>
    ${status}<p class="fine">${st.total_logged} logged · ${st.open} open · ${st.neutral} neutral · ${st.missed || 0} missed · ${st.late || 0} late (neutral, missed, late and test rows are not counted)</p>`;
  $('edgeRule').textContent = `An “edge candidate” needs a hit rate ≥ ${Math.round(C.EDGE.minRate * 100)}%, at least ${C.EDGE.minN} graded calls and p < ${C.EDGE.maxP}. With many slices some pass by luck, so confirm on new data before trusting one.`;
  $('slices').innerHTML = [sliceBlock('Hour of day (Bahrain)', st.by_hour), sliceBlock('Volatility regime', st.by_regime), sliceBlock('Near level vs mid-range', st.by_zone), sliceBlock('Model score', st.by_confidence), sliceBlock('Direction', st.by_direction), sliceBlock('Signal type', st.by_type)].join('')
    || '<div class="card muted sm">No graded calls yet. Each call is graded 60 minutes after it is issued.</div>';
  $('pbal').value = cfg.balance; $('pstake').value = cfg.stake; $('ppay').value = cfg.payout;
  const curve = C.paperCurve(log, { balance: +cfg.balance, stake: +cfg.stake, payoutPct: +cfg.payout }); const end = curve.at(-1).balance;
  const be = 1 / (1 + cfg.payout / 100);
  $('paperMeta').textContent = `$${fmt(cfg.stake)} stake · ${cfg.payout}% payout`;
  $('pnlSummary').innerHTML = `<b class="${end >= cfg.balance ? 'win' : 'loss'}">$${fmt(end)}</b> <span class="muted">(${money(end - cfg.balance, true)} over ${curve.length - 1} trades · break-even ${(be * 100).toFixed(1)}%)</span>`;
  $('pnl').style.display = curve.length > 1 ? '' : 'none'; if (curve.length > 1) drawPnl(curve); if ($('sheet').classList.contains('open')) renderTable(); }
function renderTable() { const rows = allLog().filter(x => cfg.showBoot || x.signal_type !== 'bootstrap').slice().reverse();
  const resultLabel = x => x.status === 'missed' ? 'missed' : (x.late || x.excluded_from_stats) ? ((x.result || x.status || 'open') + ' (late)') : (x.result || x.status || 'open');
  $('logtbl').innerHTML = `<tr><th>Issued</th><th>Type</th><th>Dir</th><th>Score</th><th>Entry</th><th>Exit</th><th>Result</th><th>Demo</th><th>Regime</th><th>Zone</th></tr>` +
    rows.map(x => `<tr><td>${(x.issued_bahrain || '').slice(5, 16)}</td><td>${x.signal_type}${x.late ? ' late' : ''}</td><td class="${x.direction === 'buy' ? 'win' : x.direction === 'sell' ? 'loss' : ''}">${x.direction || '—'}</td><td>${x.confidence ?? '—'}</td><td>${fmt(x.price_at_signal)}</td><td>${x.status === 'missed' ? '—' : (x.outcome_price == null ? '<small class="muted">due ' + ((x.due_bahrain || '').slice(11, 16) || '—') + '</small>' : fmt(x.outcome_price))}</td>
      <td class="${x.status === 'missed' || x.late ? 'muted' : (x.result || '')}">${resultLabel(x)}</td><td>${x.demo_trade ? (x.demo_trade.status === 'settled' ? money(x.demo_trade.profit, true) : x.demo_trade.status) : '—'}</td><td>${(x.regime && x.regime.label) || '—'}</td><td>${(x.sr && x.sr.zone) || '—'}</td></tr>`).join(''); }
let pnlChart, pnlSeries;
function drawPnl(curve) { if (!pnlChart) { pnlChart = LC.createChart($('pnl'), { height: 150, layout: { attributionLogo: false, background: { color: '#121418' }, textColor: '#8b929c' }, grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.04)' } }, timeScale: { timeVisible: true, borderVisible: false }, rightPriceScale: { borderVisible: false }, handleScroll: false, handleScale: false });
    pnlSeries = pnlChart.addAreaSeries({ lineColor: '#7b8cff', topColor: 'rgba(123,140,255,.25)', bottomColor: 'rgba(123,140,255,0)', lineWidth: 2 }); new ResizeObserver(() => pnlChart.applyOptions({ width: $('pnl').clientWidth })).observe($('pnl')); }
  const pts = []; const t0 = Math.floor(Date.now() / 1000) - 86400; curve.forEach(p => { let t = p.epoch || (curve[1] ? curve[1].epoch - 60 : t0); if (pts.length && t <= pts.at(-1).time) t = pts.at(-1).time + 1; pts.push({ time: t, value: p.balance }); });
  pnlSeries.setData(pts); pnlChart.timeScale().fitContent(); }
['pbal', 'pstake', 'ppay'].forEach((id, i) => $(id).onchange = () => { cfg[['balance', 'stake', 'payout'][i]] = +$(id).value; saveCfg(); renderStats(); });
$('showBoot').checked = cfg.showBoot; $('showBoot').onchange = () => { cfg.showBoot = $('showBoot').checked; saveCfg(); renderTable(); };
const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
$('expCsv').onclick = () => dl(`v25-signals-${Date.now()}.csv`, C.toCSV(LOG), 'text/csv');
$('expJson').onclick = () => dl(`v25-signals-${Date.now()}.json`, JSON.stringify(LOG, null, 1), 'application/json');
$('imp').onchange = async e => { const f = e.target.files[0]; if (!f) return; const t = await f.text(); let rows;
  try { rows = f.name.endsWith('.json') ? JSON.parse(t) : C.parseCSV(t); } catch (err) { toast('Import failed: ' + err.message); return; }
  const before = LOG.length; LOG = C.mergeLogs(LOG, rows); saveLog(); renderStats(); toast(`Imported ${rows.length} rows (${LOG.length - before} new).`); };
$('clear').onclick = () => { if (confirm('Delete the whole local signal log? Export first if you need it.')) { LOG = []; saveLog(); renderStats(); } };
async function syncBox(silent) {
  for (const url of ['data/signals.json', 'logger/data/signals.json']) {
    try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) continue; const rows = await r.json(); if (!Array.isArray(rows)) continue;
      const before = LOG.length; LOG = C.mergeLogs(LOG, rows); saveLog(); renderStats(); if (!silent) toast(`Synced ${rows.length} logger rows (${LOG.length - before} new).`); return;
    } catch (e) { }
  }
  if (!silent) toast('No published signal log is reachable. Use Import instead.');
}
$('syncBox').onclick = () => syncBox(false);
renderStats(); tickClock(); start();
})();
