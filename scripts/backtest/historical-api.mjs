// "API giả" trả dữ liệu như thể hôm nay là một ngày trong quá khứ (asOf).
// Nhờ đó chạy NGUYÊN BỘ MÁY assets/engine.js (buildDataset) trên dữ liệu lịch sử, không viết lại công thức.
//
// Nguyên tắc chống nhìn trước tương lai (look-ahead):
//  - Mọi chuỗi chỉ lấy các dòng có ngày <= asOf.
//  - EPS/ROE/ROA theo quý chỉ được dùng sau (ngày cuối quý + lagDays) — mô phỏng độ trễ công bố báo cáo.
//  - P/E tính lại = giá / EPS đã công bố; P/B = giá / BVPS (BVPS theo ngày của nguồn).
//  - Danh sách mã gồm cả mã sau này bị hủy niêm yết (giảm thiên lệch người sống sót).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DAY = 86400000;
export const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

// Tìm vị trí cuối cùng có arr[i] <= x (arr tăng dần, so sánh chuỗi). -1 nếu không có.
export function lastLE(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; }
  return lo - 1;
}
function parseQ(q) {
  const o = {};
  for (const part of (q || '').split('~')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i), v = part.slice(i + 1);
    (o[k] ||= []).push(v);
  }
  return o;
}
const codesOf = (s) => (s || '').split(',').filter(Boolean);

export async function loadHistory(cache) {
  const rd = async (n) => JSON.parse(await readFile(join(cache, n), 'utf8'));
  const [stocks, industry, prices, daily, quarterly, events, recs] = await Promise.all(
    ['stocks', 'industry', 'prices', 'daily', 'quarterly', 'events', 'recs'].map((n) => rd(n + '.json')),
  );
  // Sắp xếp chuỗi ratio theo ngày tăng dần để tra cứu nhị phân
  const sortSeries = (store) => { for (const c of Object.values(store)) for (const k of Object.keys(c)) c[k].sort((a, b) => a[0].localeCompare(b[0])); };
  sortSeries(daily); sortSeries(quarterly);
  // API trả giá theo thứ tự ngày giảm dần → đảo về tăng dần cho mọi cột
  for (const p of Object.values(prices)) {
    const n = p.d.length;
    let asc = true;
    for (let i = 1; i < n; i++) if (p.d[i] < p.d[i - 1]) { asc = false; break; }
    if (asc) continue;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => (p.d[a] < p.d[b] ? -1 : p.d[a] > p.d[b] ? 1 : 0));
    for (const k of Object.keys(p)) p[k] = order.map((i) => p[k][i]);
  }
  const meta = Object.fromEntries(stocks.map((s) => [s.code, s]));
  // Lịch phiên giao dịch: hợp các ngày của vài mã lớn
  const dateSet = new Set();
  for (const c of ['VNM', 'FPT', 'HPG', 'VIC', 'VCB']) for (const d of prices[c]?.d || []) dateSet.add(d);
  const tradingDates = [...dateSet].sort();
  const eventsByCode = {};
  for (const e of events) (eventsByCode[e.code] ||= []).push(e);
  return { stocks, industry, prices, daily, quarterly, events, recs, meta, tradingDates, eventsByCode };
}

export function makeGet(H, asOf, { lagDays = 45 } = {}) {
  // Mã đang niêm yết: coi là có mặt từ ngày niêm yết (một số mã có "delistedDate" cũ do chuyển sàn rồi niêm yết lại).
  // Mã đã hủy niêm yết: chỉ có mặt trong khoảng [listedDate, delistedDate).
  const active = H.stocks.filter((s) => s.listedDate <= asOf && (s.status === 'listed' || (s.delistedDate && s.delistedDate > asOf)));
  const activeSet = new Set(active.map((s) => s.code));
  const tiT = lastLE(H.tradingDates, asOf);
  const tradingDate = H.tradingDates[tiT];

  // Giá trị mới nhất của chuỗi (ngày <= limit)
  const latest = (series, limit) => {
    if (!series?.length) return null;
    const i = lastLE(series.map((x) => x[0]), limit); // chuỗi ngắn, đủ nhanh
    return i >= 0 ? series[i][1] : null;
  };
  // Chuỗi quý có hiệu lực sau lagDays
  const quarterlyAvail = (series) => (series || []).filter((x) => addDays(x[0], lagDays) <= asOf);

  function ratiosLatest(code) {
    const p = H.prices[code];
    if (!p) return null;
    const i = lastLE(p.d, tradingDate);
    if (i < 0 || p.d[i] !== tradingDate) return null;
    const close = p.c[i];
    const dl = H.daily[code] || {}, ql = H.quarterly[code] || {};
    const eps = latest(quarterlyAvail(ql.EPS_TR), asOf);
    const bvps = latest(dl.BVPS_CR, tradingDate);
    let vol10 = null;
    if (i >= 9) { let s = 0; for (let k = i - 9; k <= i; k++) s += p.v[k] || 0; vol10 = s / 10; }
    return {
      MARKETCAP: latest(dl.MARKETCAP, tradingDate),
      NMVOLUME_AVG_CR_10D: vol10,
      BETA: latest(dl.BETA, tradingDate),
      BVPS_CR: bvps,
      EPS_TR: eps,
      ROAE_TR_AVG5Q: latest(quarterlyAvail(ql.ROAE_TR_AVG5Q), asOf),
      ROAA_TR_AVG5Q: latest(quarterlyAvail(ql.ROAA_TR_AVG5Q), asOf),
      PRICE_TO_EARNINGS: eps ? (close * 1000) / eps : null,
      PRICE_TO_BOOK: bvps ? (close * 1000) / bvps : null,
    };
  }

  return async function get(url) {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v4\//, '');
    const q = parseQ(u.searchParams.get('q'));
    const ok = (data) => ({ data, totalPages: 1, totalElements: data.length });

    if (path === 'stocks') return ok(active.map((s) => ({ code: s.code, shortName: s.shortName, companyName: s.companyName, indexCode: s.indexCode })));
    if (path === 'industry_classification') return ok(H.industry);

    if (path === 'stock_prices') {
      if (q.floor) { // toàn sàn tại một phiên
        const day = (q.date || [])[0];
        if (!day || day > asOf) return ok([]);
        const rows = [];
        for (const s of active) {
          const p = H.prices[s.code];
          if (!p) continue;
          const i = lastLE(p.d, day);
          if (i >= 0 && p.d[i] === day) rows.push({ code: s.code, date: day, close: p.c[i], basicPrice: p.b[i], nmVolume: p.v[i], nmValue: p.val[i] });
        }
        return ok(rows);
      }
      const cs = codesOf((q.code || [])[0]);
      const gte = (q.date || []).find((x) => x.startsWith('gte:'))?.slice(4) || '0000-00-00';
      if (cs.includes('VNM') && cs.includes('FPT') && u.searchParams.get('size') === '1') return ok([{ code: 'VNM', date: tradingDate }]);
      const rows = [];
      for (const c of cs) {
        if (!activeSet.has(c)) continue;
        const p = H.prices[c];
        if (!p) continue;
        const end = lastLE(p.d, asOf);
        for (let i = 0; i <= end; i++) if (p.d[i] >= gte) rows.push({ code: c, date: p.d[i], adClose: p.ac[i], adHigh: p.ah[i], adLow: p.al[i] });
      }
      return ok(rows);
    }

    if (path === 'ratios/latest') {
      const where = u.searchParams.get('where') || '';
      const cs = codesOf(where.replace(/^code:/, ''));
      const rows = [];
      for (const c of cs) {
        if (!activeSet.has(c)) continue;
        const r = ratiosLatest(c);
        if (!r) continue;
        for (const [k, v] of Object.entries(r)) if (typeof v === 'number' && Number.isFinite(v)) rows.push({ code: c, ratioCode: k, value: v });
      }
      return ok(rows);
    }

    if (path === 'ratios') {
      const cs = codesOf((q.code || [])[0]);
      const rcs = codesOf((q.ratioCode || [])[0]);
      const gte = (q.reportDate || []).find((x) => x.startsWith('gte:'))?.slice(4) || '0000-00-00';
      const rows = [];
      for (const c of cs) {
        if (!activeSet.has(c)) continue;
        for (const rc of rcs) {
          if (rc === 'EPS_TR') {
            for (const [d, v] of quarterlyAvail((H.quarterly[c] || {})[rc])) if (d >= gte) rows.push({ code: c, ratioCode: rc, reportDate: d, value: v });
          } else {
            for (const [d, v] of (H.daily[c] || {})[rc] || []) if (d >= gte && d <= tradingDate) rows.push({ code: c, ratioCode: rc, reportDate: d, value: v });
          }
        }
      }
      return ok(rows);
    }

    if (path === 'events') {
      const gte = (q.effectiveDate || []).find((x) => x.startsWith('gte:'))?.slice(4) || '0000-00-00';
      const rows = [];
      for (const c of activeSet) for (const e of H.eventsByCode[c] || []) if (e.effectiveDate >= gte && e.effectiveDate <= asOf) rows.push(e);
      return ok(rows);
    }

    if (path === 'recommendations') {
      const gte = (q.reportDate || []).find((x) => x.startsWith('gte:'))?.slice(4) || '0000-00-00';
      return ok(H.recs.filter((r) => r.reportDate >= gte && r.reportDate <= asOf));
    }

    throw new Error('API giả chưa hỗ trợ: ' + url);
  };
}
