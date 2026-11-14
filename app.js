/* V25 Signal Lab: browser app. Public data only; never trades. */
(() => {
'use strict';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW register failed', err));
  });
}
const C = window.V25Core, LC = window.LightweightCharts;
const $ = id => document.getElementById(id);
const LS = { log: 'v25.log', cfg: 'v25.cfg' };
const cfg = Object.assign({ symbol: '1HZ25V', tf: '15m', balance: 50, stake: 1, payout: 95, showBoot: false }, JSON.parse(localStorage.getItem(LS.cfg) || '{}'));
const saveCfg = () => localStorage.setItem(LS.cfg, JSON.stringify(cfg));
let LOG = JSON.parse(localStorage.getItem(LS.log) || '[]');
const saveLog = () => localStorage.setItem(LS.log, JSON.stringify(LOG));
const S = { last: null, prevDay: null, tickTimes: [], candles: {}, current: null, chartCandles: [], snapshot: null, levels: [] };
const fmt = (x, d = 2) => x == null ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = x => x == null ? '—' : (x * 100).toFixed(1) + '%';
window.__app = S; // for headless tests

// ---------- tabs ----------
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'chart') chart.timeScale().fitContent(); if (b.dataset.tab === 'stats') renderStats(); });
// ---------- iOS add-to-home-screen tip ----------
(function () {
  const tip = $('installTip');
  const dismiss = $('dismissInstall');
  if (!tip) return;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isIOS && !standalone && !localStorage.getItem('v25.hideInstall')) tip.hidden = false;
  if (dismiss) dismiss.onclick = () => { localStorage.setItem('v25.hideInstall', '1'); tip.hidden = true; };
})();
// ---------- symbol ----------
for (const [k, v] of Object.entries(C.SYMBOLS)) $('symbol').add(new Option(`${v} (${k})`, k));
$('symbol').value = cfg.symbol; $('symbol').onchange = () => { cfg.symbol = $('symbol').value; saveCfg(); location.reload(); };
// ---------- clock ----------
setInterval(() => { const ep = Math.floor(Date.now() / 1000); $('clock').textContent = C.fmtBahrain(ep).slice(11, 19) + ' Bahrain';
  const now = Date.now(); S.tickTimes = S.tickTimes.filter(t => now - t < 10000); $('rate').textContent = (S.tickTimes.length / 10).toFixed(1) + ' ticks/s · ' + (client.url || '').replace('wss://', '').split('/')[0]; }, 1000);

// ---------- chart ----------
const chart = LC.createChart($('chart'), { layout: { background: { color: '#0b0f17' }, textColor: '#9aa8bd' }, grid: { vertLines: { color: '#141c2a' }, horzLines: { color: '#141c2a' } },
  timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#223047' }, rightPriceScale: { borderColor: '#223047' }, crosshair: { mode: 0 },
  localization: { timeFormatter: t => C.fmtBahrain(t).slice(5, 16) } });
const series = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444', borderVisible: false });
new ResizeObserver(() => chart.applyOptions({ width: $('chart').clientWidth, height: $('chart').clientHeight })).observe($('chart'));
const TFS = ['1d', '4h', '1h', '15m', '5m', '1m'];
TFS.forEach(tf => { const b = document.createElement('button'); b.textContent = tf.toUpperCase(); b.dataset.tf = tf; b.onclick = () => loadTF(tf); $('tfbar').appendChild(b); });
let lines = [];
function drawSR() { lines.forEach(l => series.removePriceLine(l)); lines = [];
  const c = S.chartCandles; if (c.length < 30) return; const last = c.at(-1).close;
  const lv = C.srLevels(c, { max: 12 }).sort((a, b) => Math.abs(a.price - last) - Math.abs(b.price - last)).slice(0, 6);
  S.levels = lv;
  lv.forEach(l => lines.push(series.createPriceLine({ price: l.price, color: l.price > last ? '#ef4444aa' : '#22c55eaa', lineWidth: l.strength === 'strong' ? 2 : 1, lineStyle: l.strength === 'weak' ? 2 : 0,
    axisLabelVisible: true, title: `${l.price > last ? 'R' : 'S'} ${l.strength} ×${l.touches}` })));
  const p = S.pred; if (p) { const col = p.direction === 'buy' ? '#22c55e' : p.direction === 'sell' ? '#ef4444' : '#eab308';
    lines.push(series.createPriceLine({ price: p.target_zone.high, color: col, lineStyle: 1, lineWidth: 1, title: 'target ▲' }));
    lines.push(series.createPriceLine({ price: p.target_zone.low, color: col, lineStyle: 1, lineWidth: 1, title: 'target ▼' }));
    series.setMarkers([{ time: c.at(-1).epoch, position: p.direction === 'sell' ? 'aboveBar' : 'belowBar', color: col,
      shape: p.direction === 'buy' ? 'arrowUp' : p.direction === 'sell' ? 'arrowDown' : 'circle', text: `${p.direction.toUpperCase()} ${p.confidence}% (1h)` }]); }
  $('srlegend').textContent = `S/R on ${cfg.tf}: ${lv.length} nearest levels from swing-pivot clusters (×N = touches). Dotted lines = 1h target zone. Times in Bahrain (UTC+3).`; }
async function loadTF(tf) { cfg.tf = tf; saveCfg(); document.querySelectorAll('#tfbar button').forEach(b => b.classList.toggle('on', b.dataset.tf === tf));
  try { S.chartCandles = await client.candles(cfg.symbol, tf, 1000); } catch (e) { console.error(e); return; }
  series.setData(S.chartCandles.map(c => ({ time: c.epoch, open: c.open, high: c.high, low: c.low, close: c.close }))); drawSR(); chart.timeScale().fitContent();
  chart.timeScale().setVisibleLogicalRange({ from: S.chartCandles.length - 150, to: S.chartCandles.length + 5 }); }
function onTickChart(q, ep) { const g = C.TF[cfg.tf], c = S.chartCandles; if (!c.length) return; const b = Math.floor(ep / g) * g; let last = c.at(-1);
  if (b > last.epoch) { last = { epoch: b, open: q, high: q, low: q, close: q }; c.push(last); drawSR(); } else if (b === last.epoch) { last.close = q; last.high = Math.max(last.high, q); last.low = Math.min(last.low, q); } else return;
  series.update({ time: last.epoch, open: last.open, high: last.high, low: last.low, close: last.close }); }

// ---------- connection ----------
const client = new C.DerivClient({ onStatus: (s, u) => { $('conn').textContent = s; $('dot').className = 'dot ' + (s === 'open' ? 'ok' : s === 'connecting' || s === 'reconnecting' ? 'wait' : ''); S.status = s; } });
async function start() { await client.connect();
  client.subscribe('tick', { ticks: cfg.symbol }, d => { const t = d.tick; S.last = { quote: +t.quote, epoch: +t.epoch }; S.tickTimes.push(Date.now()); S.ticks = (S.ticks || 0) + 1;
    $('px').textContent = fmt(t.quote, t.pip_size); if (S.prevDay) { const ch = (t.quote - S.prevDay) / S.prevDay * 100; $('chg').textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '% 24h'; $('chg').className = ch >= 0 ? 'up' : 'dn'; }
    onTickChart(+t.quote, +t.epoch); });
  loadTF(cfg.tf); await refreshPrediction(); setInterval(refreshPrediction, 60000); setInterval(gradeOpen, 30000); gradeOpen(); syncBox(true); }

// ---------- prediction ----------
async function refreshPrediction() { try { S.snapshot = await client.snapshot(cfg.symbol); const m1 = S.snapshot['1m']; S.prevDay = m1[Math.max(0, m1.length - 1440)].open;
  const price = S.last ? S.last.quote : m1.at(-1).close; const epoch = S.last ? S.last.epoch : m1.at(-1).epoch;
  S.pred = C.predict({ symbol: cfg.symbol, candles: S.snapshot, price, epoch }, { signal_type: 'manual', source: 'browser', stats: C.stats(allLog()) }); renderSignal(); drawSR(); }
  catch (e) { console.error('predict', e); $('sigcard').innerHTML = `<div class="loss">Prediction error: ${e.message || JSON.stringify(e)}</div>`; } }
function renderSignal() { const p = S.pred; const cls = p.direction === 'buy' ? 'up' : p.direction === 'sell' ? 'dn' : 'neu'; const arrow = p.direction === 'buy' ? '▲' : p.direction === 'sell' ? '▼' : '◆';
  const edge = p.edge_status !== 'untested';
  $('sigcard').innerHTML = `<div class="big"><div class="arrow ${cls}">${arrow}</div><div><div class="dir ${cls}">${p.direction === 'buy' ? 'UP (Rise)' : p.direction === 'sell' ? 'DOWN (Fall)' : 'NEUTRAL'}</div>
    <div>Confidence <b>${p.confidence}%</b> · 1h expiry</div><span class="badge ${edge ? 'edge' : 'untested'}">${edge ? p.edge_status : 'UNTESTED: no verified edge'}</span></div></div>
    <div class="kv"><span>Entry</span><b>${fmt(p.price_at_signal)}</b><span>Target zone</span><b>${fmt(p.target_zone.low)} – ${fmt(p.target_zone.high)}</b>
    <span>Expiry</span><b>${p.due_bahrain.slice(11, 16)} Bahrain</b><span>Nearest S/R</span><b>${p.sr.nearest_type} ${fmt(p.sr.nearest_level)} (${p.sr.distance_atr}×ATR, ${p.sr.zone})</b>
    <span>Regime</span><b>${p.regime.label} (RV ${p.regime.rv_ann_pct}% vs ${p.regime.rv_avg_ann_pct}%)</b><span>Score</span><b>${p.score} (neutral if |s|&lt;${C.DEAD_ZONE})</b></div>
    <h3 style="margin-top:10px">Why</h3><ol class="reasons">${p.reasons.map(r => `<li>${r}</li>`).join('')}</ol>
    <div class="note">Live preview, refreshed every minute. Not logged until you tap “Predict now”. The box logger logs one call every hour on the hour.</div>`;
  $('votes').innerHTML = Object.entries(p.votes).map(([k, v]) => { const w = Math.abs(v) * 50; return `<div class="vote"><span>${k} <small class="muted">w${C.WEIGHTS[k]}</small></span><div class="bar"><i style="left:${v >= 0 ? 50 : 50 - w}%;width:${w}%;background:${v >= 0 ? 'var(--up)' : 'var(--dn)'}"></i></div><b>${v > 0 ? '+' : ''}${v}</b></div>`; }).join('');
  const I = p.indicators; $('inds').innerHTML = `<div class="kv"><span>EMA 20/50/200 (1h)</span><b>${fmt(I.ema20)} / ${fmt(I.ema50)} / ${fmt(I.ema200)}</b><span>RSI 14</span><b>${I.rsi14}</b>
    <span>MACD hist</span><b>${I.macd_hist} (prev ${I.macd_hist_prev})</b><span>BB %B / width</span><b>${I.bb_pctb} / ${I.bb_width}${I.bb_squeeze ? ' squeeze' : ''}</b><span>ATR 14 (1h)</span><b>${fmt(I.atr14_1h)}</b></div>`; }
$('predictNow').onclick = async () => { $('predictNow').disabled = true; await refreshPrediction(); if (S.pred) { const s = JSON.parse(JSON.stringify(S.pred)); s.id = s.id.replace(/-m/, '-M'); LOG.push(s); saveLog(); renderStats();
  $('predictNow').textContent = `Logged ${s.direction.toUpperCase()} @ ${fmt(s.price_at_signal)}, graded at ${s.due_bahrain.slice(11, 16)}`; } setTimeout(() => { $('predictNow').disabled = false; $('predictNow').textContent = 'Predict now (log manual signal)'; }, 4000); };
async function gradeOpen() { const now = Date.now() / 1000; let ch = false;
  for (const s of LOG.filter(x => x.status === 'open' && x.due_epoch <= now - 3)) { try { const p = await client.priceAt(s.symbol, s.due_epoch); C.grade(s, p.price, p.epoch); ch = true; } catch (e) { } }
  if (ch) { saveLog(); renderStats(); } }

// ---------- stats ----------
const allLog = () => LOG.filter(x => x.symbol === cfg.symbol);
function sliceTable(title, obj) { const rows = Object.entries(obj); if (!rows.length) return '';
  return `<h4>${title}</h4><div class="tablewrap"><table><tr><th>${title}</th><th>n</th><th>W-L</th><th>Hit</th><th>95% CI</th><th>p (vs 50%)</th><th></th></tr>${rows.map(([k, s]) =>
    `<tr><td>${k}</td><td>${s.n}</td><td>${s.wins}-${s.losses}</td><td class="${s.rate > 0.5 ? 'win' : s.rate < 0.5 ? 'loss' : ''}">${pct(s.rate)}</td><td>${pct(s.ci_low)}–${pct(s.ci_high)}</td><td>${s.p_value.toFixed(3)}</td><td>${s.edge_candidate ? '<span class="badge edge">edge candidate</span>' : s.n < C.EDGE.minN ? '<small class="muted">need ' + (C.EDGE.minN - s.n) + ' more</small>' : ''}</td></tr>`).join('')}</table></div>`; }
function renderStats() { const log = allLog(); const st = C.stats(log); const o = st.overall;
  $('overall').innerHTML = `<h3>Overall hit rate · ${cfg.symbol}</h3><div class="big-rate ${o.rate > 0.5 ? 'win' : o.rate < 0.5 ? 'loss' : ''}">${pct(o.rate)}</div>
    <div>vs 50% coin-flip baseline · n = <b>${o.n}</b> graded (${o.wins}W / ${o.losses}L) · 95% CI ${pct(o.ci_low)}–${pct(o.ci_high)} · p = ${o.p_value.toFixed(3)}</div>
    <div class="note">${st.total_logged} logged · ${st.open} open · ${st.neutral} neutral (not counted) · ${st.missed || 0} missed · ${st.late || 0} late · bootstrap, missed and late entries excluded. ${o.edge_candidate ? '<span class="badge edge">overall edge candidate</span>' : '<span class="badge untested">no verified edge</span>'}</div>`;
  $('edgeRule').textContent = `“Edge candidate” = hit rate ≥ ${Math.round(C.EDGE.minRate * 100)}% with n ≥ ${C.EDGE.minN} and one-sided binomial p < ${C.EDGE.maxP}. With many slices, some will pass by luck; confirm on new data before trusting one.`;
  $('slices').innerHTML = [sliceTable('Hour (Bahrain)', st.by_hour), sliceTable('Regime', st.by_regime), sliceTable('S/R proximity', st.by_zone), sliceTable('Confidence', st.by_confidence), sliceTable('Direction', st.by_direction), sliceTable('Signal type', st.by_type)].join('') || '<div class="muted">No graded signals yet. Each call is graded 60 min after it is issued.</div>';
  // paper
  $('pbal').value = cfg.balance; $('pstake').value = cfg.stake; $('ppay').value = cfg.payout;
  const curve = C.paperCurve(log, { balance: +cfg.balance, stake: +cfg.stake, payoutPct: +cfg.payout }); const end = curve.at(-1).balance;
  const be = 1 / (1 + cfg.payout / 100);
  $('pnlSummary').innerHTML = `Paper balance <b class="${end >= cfg.balance ? 'win' : 'loss'}">$${fmt(end)}</b> (${end >= cfg.balance ? '+' : ''}${fmt(end - cfg.balance)}) over ${curve.length - 1} trades · break-even hit rate at ${cfg.payout}% payout = <b>${(be * 100).toFixed(1)}%</b>`;
  drawPnl(curve);
  // table
  const rows = log.filter(x => cfg.showBoot || x.signal_type !== 'bootstrap').slice().reverse();
  const resultLabel = x => x.status === 'missed' ? 'missed' : (x.late || x.excluded_from_stats) ? ((x.result || x.status || 'open') + ' (late)') : (x.result || x.status || 'open');
  $('logtbl').innerHTML = `<tr><th>Issued (Bahrain)</th><th>Type</th><th>Dir</th><th>Conf</th><th>Entry</th><th>Exit</th><th>Result</th><th>Hr</th><th>Regime</th><th>S/R dist (ATR)</th><th>Zone</th><th>Edge</th></tr>` +
    rows.map(x => `<tr><td>${(x.issued_bahrain || '').slice(5, 16)}</td><td>${x.signal_type}${x.late ? ' late' : ''}</td><td class="${x.direction === 'buy' ? 'win' : x.direction === 'sell' ? 'loss' : ''}">${x.direction || '—'}</td><td>${x.confidence ?? '—'}</td><td>${fmt(x.price_at_signal)}</td><td>${x.status === 'missed' ? '—' : (x.outcome_price == null ? '<small class="muted">due ' + ((x.due_bahrain || '').slice(11, 16) || '—') + '</small>' : fmt(x.outcome_price))}</td>
      <td class="${x.status === 'missed' || x.late ? 'muted' : (x.result || '')}">${resultLabel(x)}</td><td>${x.hour_bahrain != null ? String(x.hour_bahrain).padStart(2, '0') : '—'}</td><td>${(x.regime && x.regime.label) || '—'}</td><td>${x.sr && x.sr.distance_atr != null ? x.sr.distance_atr : '—'}</td><td>${(x.sr && x.sr.zone) || '—'}</td><td>${x.edge_status || (x.excluded_from_stats ? 'excluded' : '—')}</td></tr>`).join(''); }
let pnlChart, pnlSeries;
function drawPnl(curve) { if (!pnlChart) { pnlChart = LC.createChart($('pnl'), { height: 180, layout: { background: { color: '#131a26' }, textColor: '#9aa8bd' }, grid: { vertLines: { visible: false }, horzLines: { color: '#1c2638' } }, timeScale: { timeVisible: true } });
    pnlSeries = pnlChart.addLineSeries({ color: '#3b82f6', lineWidth: 2 }); new ResizeObserver(() => pnlChart.applyOptions({ width: $('pnl').clientWidth })).observe($('pnl')); }
  const pts = []; let t0 = Math.floor(Date.now() / 1000) - 86400; curve.forEach((p, i) => { let t = p.epoch || (curve[1] ? curve[1].epoch - 60 : t0); if (pts.length && t <= pts.at(-1).time) t = pts.at(-1).time + 1; pts.push({ time: t, value: p.balance }); });
  pnlSeries.setData(pts); pnlChart.timeScale().fitContent(); }
['pbal', 'pstake', 'ppay'].forEach((id, i) => $(id).onchange = () => { cfg[['balance', 'stake', 'payout'][i]] = +$(id).value; saveCfg(); renderStats(); });
$('showBoot').checked = cfg.showBoot; $('showBoot').onchange = () => { cfg.showBoot = $('showBoot').checked; saveCfg(); renderStats(); };
const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
$('expCsv').onclick = () => dl(`v25-signals-${Date.now()}.csv`, C.toCSV(LOG), 'text/csv');
$('expJson').onclick = () => dl(`v25-signals-${Date.now()}.json`, JSON.stringify(LOG, null, 1), 'application/json');
$('imp').onchange = async e => { const f = e.target.files[0]; if (!f) return; const t = await f.text(); let rows;
  try { rows = f.name.endsWith('.json') ? JSON.parse(t) : C.parseCSV(t); } catch (err) { alert('Import failed: ' + err.message); return; }
  const before = LOG.length; LOG = C.mergeLogs(LOG, rows); saveLog(); renderStats(); alert(`Imported ${rows.length} rows (${LOG.length - before} new).`); };
$('clear').onclick = () => { if (confirm('Delete the whole local signal log? Export first if you need it.')) { LOG = []; saveLog(); renderStats(); } };
async function syncBox(silent) {
  const urls = ['data/signals.json', 'logger/data/signals.json'];
  let lastErr = null;
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) { lastErr = new Error(String(r.status)); continue; }
      const rows = await r.json();
      if (!Array.isArray(rows)) throw new Error('log is not an array');
      const before = LOG.length; LOG = C.mergeLogs(LOG, rows); saveLog(); renderStats();
      if (!silent) alert(`Synced ${rows.length} logger rows (${LOG.length - before} new).`);
      return;
    } catch (e) { lastErr = e; }
  }
  if (!silent) alert('No published signal log is reachable. Use Import with a signals.csv or signals.json export instead.');
}
$('syncBox').onclick = () => syncBox(false);
renderStats(); start();
})();
