// Backtest: chạy nguyên bộ máy assets/engine.js tại các ngày cuối tháng trong quá khứ,
// rồi đo kết quả thực tế sau 3/6/12 tháng.
// Chạy: node scripts/backtest/run-backtest.mjs [--from 2023-03] [--lag 45] [--cost 0.006] [--label tên] [--maxUpside 0.6]
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDataset, CONFIG } from '../../assets/engine.js';
import { loadHistory, makeGet, lastLE, addDays } from './historical-api.mjs';
import { CACHE } from './fetch-history.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const FROM = args.from || '2023-03';
const LAG = +(args.lag || 45);
const COST = +(args.cost || 0.006); // chi phí khứ hồi: phí 2 chiều + thuế bán + trượt giá
const LABEL = args.label || 'goc';
const HORIZONS = [3, 6, 12];
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'backtest-results');

const cfg = JSON.parse(JSON.stringify(CONFIG));
if (args.maxUpside) cfg.maxUpside = +args.maxUpside;
// --variant tên: lấy cấu hình ghi đè từ scripts/backtest/variants.json (thay nguyên từng khoá cấp 1)
if (args.variant) {
  const { readFile: rf } = await import('node:fs/promises');
  const variants = JSON.parse(await rf(join(dirname(fileURLToPath(import.meta.url)), 'variants.json'), 'utf8'));
  if (!variants[args.variant]) throw new Error('Không có phương án ' + args.variant);
  Object.assign(cfg, JSON.parse(JSON.stringify(variants[args.variant])));
}
const SPLIT = args.split || '2024-07'; // tín hiệu trước mốc này = giai đoạn "học", từ mốc này = giai đoạn "kiểm tra"

const H = await loadHistory(CACHE);
const lastDate = H.tradingDates[H.tradingDates.length - 1];

// ---------- Ngày cuối tháng giao dịch ----------
const months = [];
{
  const seen = new Map();
  for (const d of H.tradingDates) seen.set(d.slice(0, 7), d);
  for (const [m, d] of seen) if (m >= FROM) months.push(d);
}
const addMonths = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

// ---------- Tiện ích thống kê ----------
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
function rank(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
function spearman(x, y) {
  const n = x.length; if (n < 8) return null;
  const rx = rank(x), ry = rank(y), mx = mean(rx), my = mean(ry);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

// ---------- Lợi suất tương lai của một mã ----------
// Vào lệnh ở giá đóng cửa phiên SAU ngày tín hiệu; ra lệnh sau h tháng (hoặc phiên cuối còn dữ liệu nếu mã bị hủy niêm yết).
function fwdReturn(code, signalDate, h) {
  const p = H.prices[code];
  if (!p) return null;
  const i0 = lastLE(p.d, signalDate);
  if (i0 < 0 || p.d[i0] !== signalDate || i0 + 1 >= p.d.length) return null;
  const entryI = i0 + 1;
  const target = addMonths(p.d[entryI], h);
  if (target > lastDate) return null; // chưa đủ thời gian để đo
  const exitI = lastLE(p.d, target);
  if (exitI <= entryI) return null;
  const a = p.ac[entryI], b = p.ac[exitI];
  return a > 0 && b > 0 ? b / a - 1 : null;
}

// ---------- Mô phỏng giao dịch theo vùng mua/bán/cắt lỗ ----------
// Mua ở giá đóng cửa phiên sau tín hiệu; bán khi giá cao trong ngày chạm cận dưới vùng bán;
// cắt lỗ khi giá thấp trong ngày chạm mức cắt lỗ (thoát ở min(mức cắt lỗ, giá đóng cửa) để không lạc quan quá);
// hết 12 tháng thì bán ở giá đóng cửa. Chuỗi giá đã điều chỉnh cổ tức, quy về mặt bằng giá tại ngày tín hiệu.
// opts.stop: 'zone' (mức cắt lỗ của web) | 'none' (không cắt lỗ) | số 0.15 (cắt lỗ cố định 15% dưới giá mua)
function simulateZone(code, signalDate, z, opts = {}, months12 = 12) {
  const stopMode = opts.stop ?? 'zone';
  const p = H.prices[code];
  if (!p || !z) return null;
  const i0 = lastLE(p.d, signalDate);
  if (i0 < 0 || p.d[i0] !== signalDate || i0 + 1 >= p.d.length) return null;
  const f = p.c[i0] / p.ac[i0];
  const entryI = i0 + 1;
  const endDate = addMonths(p.d[entryI], months12);
  if (endDate > lastDate) return null;
  const entry = p.ac[entryI] * f * 1000;
  if (!(entry > 0)) return null;
  let exit = null, kind = 'timeout', days = 0;
  const stopPx = stopMode === 'none' ? -Infinity : stopMode === 'zone' ? z.stop : entry * (1 - stopMode);
  for (let i = entryI + 1; i < p.d.length && p.d[i] <= endDate; i++) {
    days = i - entryI;
    const hi = p.ah[i] * f * 1000, lo = p.al[i] * f * 1000, cl = p.ac[i] * f * 1000;
    if (lo <= stopPx) { exit = Math.min(stopPx, cl); kind = 'stop'; break; } // bi quan: nếu cả hai cùng xảy ra trong 1 phiên, tính cắt lỗ trước
    if (hi >= z.sellLow) { exit = z.sellLow; kind = 'target'; break; }
    exit = cl;
  }
  if (exit == null) return null;
  return { ret: exit / entry - 1, kind, days, entry };
}

// ---------- Vòng chạy ----------
const t0 = Date.now();
const snapshots = []; // mỗi tín hiệu: danh sách mã và đặc trưng + lợi suất tương lai
for (const asOf of months) {
  const now = new Date(asOf + 'T10:00:00Z');
  let data;
  try {
    data = await buildDataset({ get: makeGet(H, asOf, { lagDays: LAG }), now, config: cfg });
  } catch (e) {
    console.log(`${asOf}: bỏ qua (${e.message})`);
    continue;
  }
  const signalDate = data.tradingDate;
  const rows = [];
  for (const s of Object.values(data.stocks)) {
    const fw = {};
    for (const h of HORIZONS) fw[h] = fwdReturn(s.code, signalDate, h);
    rows.push({
      code: s.code, sector: s.sector, er: s.er, upside: s.upside, scores: s.scores, status: s.zones.statusKey, pe: s.pe, mcap: s.mcap,
      zones: s.zones, price: s.price, fw,
      zone12: ['buy', 'buyweak'].includes(s.zones.statusKey) ? simulateZone(s.code, signalDate, s.zones) : null,
      zoneNoStop: ['buy', 'buyweak'].includes(s.zones.statusKey) ? simulateZone(s.code, signalDate, s.zones, { stop: 'none' }) : null,
      zoneStop15: ['buy', 'buyweak'].includes(s.zones.statusKey) ? simulateZone(s.code, signalDate, s.zones, { stop: 0.15 }) : null,
    });
  }
  snapshots.push({ asOf, signalDate, universe: data.universeCount, top20: data.top20, top10: data.top10.map((t) => t.code), rows });
  console.log(`${asOf}: ${rows.length} mã, top20 trong vùng mua ${data.top20.filter((c) => ['buy', 'buyweak'].includes(data.stocks[c].zones.statusKey)).length}/20 [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
}

// ---------- Tổng hợp ----------
const net = (r) => (r == null ? null : r - COST);
// Sai số chuẩn Newey-West cho chuỗi chênh lệch theo tháng (các cửa sổ h tháng chồng lấn nên tự tương quan, lag = h-1)
function nwSE(series, lag) {
  const n = series.length;
  if (n < 6) return null;
  const m = mean(series);
  const g = (l) => { let s = 0; for (let i = l; i < n; i++) s += (series[i] - m) * (series[i - l] - m); return s / n; };
  let v = g(0);
  for (let l = 1; l <= Math.min(lag, n - 2); l++) v += 2 * (1 - l / (lag + 1)) * g(l);
  return Math.sqrt(Math.max(v, 0) / n);
}
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Dải dao động của việc chọn NGẪU NHIÊN 20 mã (1000 lần): nếu Top 20 nằm trong dải này thì chưa phân biệt được với may rủi
function randomBand(h, B = 1000) {
  const rng = mulberry32(12345);
  const sigs = snapshots.map((sn) => sn.rows.filter((r) => r.fw[h] != null)).filter((rs) => rs.length >= 30);
  if (!sigs.length) return null;
  const draws = [];
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (const rs of sigs) {
      const uni = mean(rs.map((r) => r.fw[h]));
      const idx = rs.map((_, i) => i);
      for (let i = 0; i < 20; i++) { const j = i + Math.floor(rng() * (idx.length - i)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      s += mean(idx.slice(0, 20).map((i) => rs[i].fw[h])) - uni;
    }
    draws.push(s / sigs.length);
  }
  draws.sort((a, b) => a - b);
  return { nSignals: sigs.length, lo: draws[Math.floor(B * 0.025)], hi: draws[Math.floor(B * 0.975)], sd: sd(draws) };
}
function cohortStats(name, pick) {
  const res = { name, byH: {} };
  for (const h of HORIZONS) {
    const per = []; // mỗi tín hiệu một điểm: lợi suất trung bình nhóm, lợi suất vũ trụ
    for (const sn of snapshots) {
      const uni = sn.rows.map((r) => r.fw[h]).filter((x) => x != null);
      if (uni.length < 20) continue;
      const sel = pick(sn).map((r) => r.fw[h]).filter((x) => x != null);
      if (sel.length < 3) continue;
      per.push({ asOf: sn.asOf, c: mean(sel), u: mean(uni), n: sel.length });
    }
    if (!per.length) { res.byH[h] = null; continue; }
    const ex = per.map((x) => x.c - x.u);
    const nEff = Math.max(1, per.length / h); // các cửa sổ chồng lấn nên số quan sát độc lập ~ n/h
    res.byH[h] = {
      nSignals: per.length, nEff: +nEff.toFixed(1), avgNames: +mean(per.map((x) => x.n)).toFixed(1),
      gross: mean(per.map((x) => x.c)), net: mean(per.map((x) => net(x.c))), universe: mean(per.map((x) => x.u)),
      excess: mean(ex), excessMedian: median(ex), beatRate: ex.filter((x) => x > 0).length / ex.length,
      excessSE: sd(ex) / Math.sqrt(nEff), excessSE_NW: nwSE(ex, h - 1), worst: Math.min(...per.map((x) => x.c)),
    };
  }
  return res;
}
const inBuy = (r) => ['buy', 'buyweak'].includes(r.status);
const cohorts = [
  cohortStats('Toàn bộ mã đạt bộ lọc (mốc so sánh)', (s) => s.rows),
  cohortStats('Top 20', (s) => s.rows.filter((r) => s.top20.includes(r.code))),
  // Các bộ lọc đơn giản để so sánh: nếu mô hình không hơn được những cách này thì chưa chứng minh được giá trị gia tăng
  cohortStats('[So sánh] 20 mã P/E thấp nhất', (s) => s.rows.filter((r) => r.pe > 0).sort((a, b) => a.pe - b.pe).slice(0, 20)),
  cohortStats('[So sánh] 20 mã vốn hoá lớn nhất', (s) => [...s.rows].sort((a, b) => b.mcap - a.mcap).slice(0, 20)),
  cohortStats('[So sánh] 20 mã điểm Định giá cao nhất', (s) => [...s.rows].sort((a, b) => b.scores.value - a.scores.value).slice(0, 20)),
  cohortStats('[So sánh] 20 mã tiềm năng ước tính cao nhất', (s) => [...s.rows].sort((a, b) => b.er - a.er).slice(0, 20)),
  cohortStats('Mã nổi bật (Top 10)', (s) => s.rows.filter((r) => s.top10.includes(r.code))),
  cohortStats('Top 20 đang trong vùng mua', (s) => s.rows.filter((r) => s.top20.includes(r.code) && inBuy(r))),
  cohortStats('Mọi mã trong vùng mua (xu hướng tốt)', (s) => s.rows.filter((r) => r.status === 'buy')),
  cohortStats('Mọi mã trong vùng mua (xu hướng yếu)', (s) => s.rows.filter((r) => r.status === 'buyweak')),
  cohortStats('Mã "chờ điều chỉnh"', (s) => s.rows.filter((r) => r.status === 'wait')),
  cohortStats('Mã "vùng chốt lời"', (s) => s.rows.filter((r) => r.status === 'sell')),
  cohortStats('LN kỳ vọng ≥ 25%', (s) => s.rows.filter((r) => r.er >= 0.25)),
  cohortStats('LN kỳ vọng ≥ 40%', (s) => s.rows.filter((r) => r.er >= 0.4)),
  cohortStats('LN kỳ vọng < 10%', (s) => s.rows.filter((r) => r.er < 0.1)),
];

// Nhóm theo LN kỳ vọng (hiệu chuẩn): bảng ngũ phân vị trong từng tín hiệu
const quint = {};
for (const h of [12]) {
  const buckets = [[], [], [], [], []];
  for (const sn of snapshots) {
    const rs = sn.rows.filter((r) => r.fw[h] != null).sort((a, b) => a.er - b.er);
    if (rs.length < 25) continue;
    const uni = mean(rs.map((r) => r.fw[h]));
    rs.forEach((r, i) => buckets[Math.min(4, Math.floor((i * 5) / rs.length))].push({ er: r.er, fw: r.fw[h], ex: r.fw[h] - uni }));
  }
  quint[h] = buckets.map((b, i) => ({ q: i + 1, n: b.length, avgER: mean(b.map((x) => x.er)), avgRealized: mean(b.map((x) => x.fw)), avgExcess: mean(b.map((x) => x.ex)) }));
}

// Hệ số tương quan hạng (IC) giữa từng chỉ số lúc tín hiệu và lợi suất thực tế
const factors = {
  'LN kỳ vọng (er)': (r) => r.er, 'Điểm tổng': (r) => r.scores.total, 'Chất lượng': (r) => r.scores.quality, 'Tăng trưởng': (r) => r.scores.growth,
  'Định giá': (r) => r.scores.value, 'An toàn': (r) => r.scores.safety, 'Cổ tức': (r) => r.scores.dividend, 'Tiềm năng giá (upside)': (r) => r.upside,
};
const ic = {};
for (const h of HORIZONS) {
  ic[h] = {};
  for (const [name, f] of Object.entries(factors)) {
    const vals = [];
    for (const sn of snapshots) {
      const rs = sn.rows.filter((r) => r.fw[h] != null && Number.isFinite(f(r)));
      const c = spearman(rs.map(f), rs.map((r) => r.fw[h]));
      if (c != null) vals.push(c);
    }
    ic[h][name] = vals.length ? { mean: mean(vals), pos: vals.filter((x) => x > 0).length / vals.length, n: vals.length, nEff: +(vals.length / h).toFixed(1), se: sd(vals) / Math.sqrt(Math.max(1, vals.length / h)) } : null;
  }
}

// Mô phỏng giao dịch theo vùng
function zoneStats(name, filter, key = 'zone12') {
  const trades = [];
  for (const sn of snapshots) for (const r of sn.rows) if (r[key] && filter(r, sn)) trades.push({ ...r[key], asOf: sn.asOf, code: r.code, status: r.status });
  if (!trades.length) return { name, n: 0 };
  const rets = trades.map((t) => t.ret - COST);
  const bh = []; // cùng mã, cùng thời điểm, mua giữ 12 tháng
  for (const sn of snapshots) for (const r of sn.rows) if (r[key] && filter(r, sn) && r.fw[12] != null) bh.push(r.fw[12] - COST);
  const k = (x) => trades.filter((t) => t.kind === x).length / trades.length;
  const wins = rets.filter((x) => x > 0);
  return {
    name, n: trades.length, avgRet: mean(rets), medianRet: median(rets), winRate: wins.length / rets.length,
    target: k('target'), stop: k('stop'), timeout: k('timeout'), avgDays: mean(trades.map((t) => t.days)),
    avgWin: mean(wins), avgLoss: mean(rets.filter((x) => x <= 0)), buyHold12m: mean(bh),
  };
}
const zones = [
  zoneStats('Mọi mã trong vùng mua', () => true),
  zoneStats('Vùng mua – xu hướng tốt', (r) => r.status === 'buy'),
  zoneStats('Vùng mua – xu hướng yếu', (r) => r.status === 'buyweak'),
  zoneStats('Mọi mã vùng mua — KHÔNG cắt lỗ (chỉ bán khi chạm vùng bán hoặc hết 12T)', () => true, 'zoneNoStop'),
  zoneStats('Mọi mã vùng mua — cắt lỗ cố định 15% dưới giá mua', () => true, 'zoneStop15'),
];

// Độ "bão hoà" lúc tín hiệu và lợi suất thị trường (mặt bằng) sau đó
const satVsFuture = snapshots.map((sn) => ({
  asOf: sn.asOf, buyShare: sn.rows.filter(inBuy).length / sn.rows.length,
  uni6: mean(sn.rows.map((r) => r.fw[6]).filter((x) => x != null)), uni12: mean(sn.rows.map((r) => r.fw[12]).filter((x) => x != null)),
}));
// IC của LN kỳ vọng theo năm (12 tháng) để xem có ổn định không
const icByYear = {};
for (const h of [6, 12]) {
  const m = {};
  for (const sn of snapshots) {
    const rs = sn.rows.filter((r) => r.fw[h] != null && Number.isFinite(r.er));
    const c = spearman(rs.map((r) => r.er), rs.map((r) => r.fw[h]));
    if (c != null) (m[sn.asOf.slice(0, 4)] ||= []).push(c);
  }
  icByYear[h] = Object.fromEntries(Object.entries(m).map(([y, a]) => [y, { ic: mean(a), n: a.length }]));
}
// Chênh lệch nhóm LN kỳ vọng cao nhất (Q5) so với thấp nhất (Q1) theo năm, 12 tháng
const spreadByYear = {};
for (const sn of snapshots) {
  const rs = sn.rows.filter((r) => r.fw[12] != null).sort((a, b) => a.er - b.er);
  if (rs.length < 25) continue;
  const k = Math.floor(rs.length / 5);
  const lo = mean(rs.slice(0, k).map((r) => r.fw[12])), hi = mean(rs.slice(-k).map((r) => r.fw[12]));
  (spreadByYear[sn.asOf.slice(0, 4)] ||= []).push(hi - lo);
}
const spreadYear = Object.fromEntries(Object.entries(spreadByYear).map(([y, a]) => [y, { spread: mean(a), n: a.length, pos: a.filter((x) => x > 0).length / a.length }]));

// Theo năm (Top 20 so với mặt bằng, 12 tháng)
const byYear = {};
for (const sn of snapshots) {
  const y = sn.asOf.slice(0, 4);
  const uni = sn.rows.map((r) => r.fw[12]).filter((x) => x != null);
  const t20 = sn.rows.filter((r) => sn.top20.includes(r.code)).map((r) => r.fw[12]).filter((x) => x != null);
  if (uni.length < 20 || t20.length < 5) continue;
  (byYear[y] ||= []).push({ c: mean(t20), u: mean(uni) });
}
const yearly = Object.fromEntries(Object.entries(byYear).map(([y, a]) => [y, { n: a.length, top20: mean(a.map((x) => x.c)), universe: mean(a.map((x) => x.u)) }]));

// Dấu hiệu bão hoà: tỷ lệ mã trong vùng mua / chạm trần
const sat = snapshots.map((sn) => ({ asOf: sn.asOf, buyShareUniverse: sn.rows.filter(inBuy).length / sn.rows.length, buyShareTop20: sn.top20.filter((c) => inBuy(sn.rows.find((r) => r.code === c) || {})).length / 20 }));

// Chỉ số chính cho từng giai đoạn (dùng để so sánh các phương án, tách "học" và "kiểm tra")
function keyMetrics(snaps) {
  const out = { signals: snaps.length };
  const excess = (pick, h) => {
    const a = [];
    for (const sn of snaps) {
      const uni = sn.rows.map((r) => r.fw[h]).filter((x) => x != null);
      const sel = pick(sn).map((r) => r.fw[h]).filter((x) => x != null);
      if (uni.length >= 20 && sel.length >= 3) a.push(mean(sel) - mean(uni));
    }
    return a.length ? { ex: mean(a), n: a.length, beat: a.filter((x) => x > 0).length / a.length } : null;
  };
  out.top20 = { 6: excess((s) => s.rows.filter((r) => s.top20.includes(r.code)), 6), 12: excess((s) => s.rows.filter((r) => s.top20.includes(r.code)), 12) };
  out.top10 = { 12: excess((s) => s.rows.filter((r) => s.top10.includes(r.code)), 12) };
  out.er25 = { 12: excess((s) => s.rows.filter((r) => r.er >= 0.25), 12) };
  const icOf = (f, h) => {
    const v = [];
    for (const sn of snaps) {
      const rs = sn.rows.filter((r) => r.fw[h] != null && Number.isFinite(f(r)));
      const c = spearman(rs.map(f), rs.map((r) => r.fw[h]));
      if (c != null) v.push(c);
    }
    return v.length ? mean(v) : null;
  };
  out.ic = { total12: icOf((r) => r.scores.total, 12), er12: icOf((r) => r.er, 12), total6: icOf((r) => r.scores.total, 6), er6: icOf((r) => r.er, 6) };
  out.icFactors12 = Object.fromEntries(Object.entries(factors).map(([k, f]) => [k, icOf(f, 12)]));
  const byYr = {};
  for (const sn of snaps) {
    const uni = sn.rows.map((r) => r.fw[12]).filter((x) => x != null);
    const t20 = sn.rows.filter((r) => sn.top20.includes(r.code)).map((r) => r.fw[12]).filter((x) => x != null);
    if (uni.length >= 20 && t20.length >= 5) (byYr[sn.asOf.slice(0, 4)] ||= []).push(mean(t20) - mean(uni));
  }
  out.top20ByYear12 = Object.fromEntries(Object.entries(byYr).map(([y, a]) => [y, { ex: mean(a), n: a.length }]));
  const trades = [];
  const bh = [];
  for (const sn of snaps) for (const r of sn.rows) if (r.zone12) { trades.push(r.zone12); if (r.fw[12] != null) bh.push(r.fw[12] - COST); }
  if (trades.length) {
    const rets = trades.map((t) => t.ret - COST).sort((a, b) => a - b);
    out.zone = {
      n: trades.length, avg: mean(rets), median: median(rets), p5: rets[Math.floor(rets.length * 0.05)],
      stop: trades.filter((t) => t.kind === 'stop').length / trades.length, target: trades.filter((t) => t.kind === 'target').length / trades.length,
      avgLoss: mean(rets.filter((x) => x <= 0)), buyHold: mean(bh),
    };
  }
  return out;
}
const keyBy = { all: keyMetrics(snapshots), train: keyMetrics(snapshots.filter((s) => s.asOf < SPLIT)), test: keyMetrics(snapshots.filter((s) => s.asOf >= SPLIT)) };

const summary = {
  keyBy, split: SPLIT, variant: args.variant || null, config: { weights: cfg.weights, top20Rank: cfg.top20Rank, stop: cfg.stop, maxUpside: cfg.maxUpside },
  label: LABEL, params: { from: FROM, lagDays: LAG, cost: COST, maxUpside: cfg.maxUpside }, signals: snapshots.length,
  firstSignal: snapshots[0]?.asOf, lastSignal: snapshots[snapshots.length - 1]?.asOf, lastPriceDate: lastDate,
  cohorts, quintilesByER12m: quint, ic, zones, yearly, satVsFuture, icByYear, spreadYear,
  randomBand: { 6: randomBand(6), 12: randomBand(12) },
  saturation: { avgBuyShareUniverse: mean(sat.map((x) => x.buyShareUniverse)), avgBuyShareTop20: mean(sat.map((x) => x.buyShareTop20)) },
  avgUniverse: mean(snapshots.map((s) => s.universe)),
};
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, `ket-qua-${LABEL}.json`), JSON.stringify(summary, null, 1));
console.log(`Xong ${snapshots.length} tín hiệu trong ${((Date.now() - t0) / 1000).toFixed(0)}s → backtest-results/ket-qua-${LABEL}.json`);
