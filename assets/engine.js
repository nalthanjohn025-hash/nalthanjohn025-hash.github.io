// Bộ máy lọc & chấm điểm cổ phiếu HOSE.
// Dùng chung cho script Node (GitHub Actions, scripts/update-data.js) và trình duyệt (nút "Cập nhật trực tiếp").
// Nguồn dữ liệu: VNDirect Finfo API công khai (api-finfo.vndirect.com.vn).

export const API = 'https://api-finfo.vndirect.com.vn/v4';

export const CONFIG = {
  minMarketCap: 3e12,        // vốn hoá tối thiểu 3.000 tỷ đồng
  minLiquidity: 5e9,         // giá trị giao dịch TB 10 phiên tối thiểu 5 tỷ đồng/phiên
  minReturn: 0.25,           // lợi nhuận kỳ vọng tối thiểu (giá + cổ tức) khi mua ở cận trên vùng mua
  top10Tiers: [
    { key: 'strict', label: 'Đạt đủ tiêu chí', erMin: 0.25, erMax: 0.45, safety: 60, quality: 50, trend: true },
    { key: 'relaxed', label: 'Nới lỏng tiêu chí', erMin: 0.22, erMax: 0.50, safety: 50, quality: 40, trend: false },
  ],
  weights: { quality: 0.25, growth: 0.15, value: 0.20, safety: 0.30, dividend: 0.10 },
  analystWeight: 0.4,        // tỷ trọng giá mục tiêu đồng thuận của CTCK (0,5 nếu có từ 2 CTCK trở lên)
  maxUpside: 0.6,            // trần tiềm năng tăng giá 12 tháng của mô hình
  maxPerSector: { top20: 5, top10: 3 }, // giới hạn số mã cùng ngành để đa dạng hoá
};

const RATIO_CODES = [
  'MARKETCAP', 'NMVOLUME_AVG_CR_10D', 'PRICE_HIGHEST_CR_52W', 'PRICE_LOWEST_CR_52W', 'OUTSTANDING_SHARES',
  'FREEFLOAT', 'BETA', 'PRICE_TO_EARNINGS', 'PRICE_TO_BOOK', 'DIVIDEND_YIELD', 'BVPS_CR',
  'ROAE_TR_AVG5Q', 'ROAA_TR_AVG5Q', 'EPS_TR', 'FOREIGN_OWNERSHIP',
];
const FIN_SECTORS = new Set(['Ngân hàng', 'Dịch vụ tài chính', 'Bảo hiểm']);
const DUAL_SECTORS = new Set(['Bất động sản']);

const DAY = 86400000;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const rnd = (x, d = 0) => (isNum(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

export function vnToday(now = new Date()) {
  return new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
}
function median(a) {
  const s = a.filter(isNum).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(a) {
  const s = a.filter(isNum);
  return s.length ? s.reduce((t, x) => t + x, 0) / s.length : null;
}
function stdev(a) {
  const s = a.filter(isNum);
  if (s.length < 2) return null;
  const m = mean(s);
  return Math.sqrt(s.reduce((t, x) => t + (x - m) ** 2, 0) / (s.length - 1));
}
function chunk(a, n) {
  const out = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        await fn(items[k], k);
      }
    }),
  );
}
// Bước giá HOSE: <10.000đ: 10đ; 10.000–49.950đ: 50đ; ≥50.000đ: 100đ
export function roundPrice(p) {
  if (!isNum(p) || p <= 0) return null;
  const t = p < 10000 ? 10 : p < 50000 ? 50 : 100;
  return Math.round(p / t) * t;
}
// Trả về hàm tính phân vị (0–100) của một giá trị trong tập.
function ranker(values) {
  const s = values.filter(isNum).sort((a, b) => a - b);
  return (v) => {
    if (!isNum(v) || !s.length) return null;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (s[m] < v) lo = m + 1; else hi = m;
    }
    let eq = lo;
    while (eq < s.length && s[eq] === v) eq++;
    return ((lo + (eq - lo) / 2) / s.length) * 100;
  };
}
const or = (x, d) => (isNum(x) ? x : d);

async function fetchAll(get, url, size = 5000) {
  const out = [];
  for (let page = 1; page <= 40; page++) {
    const d = await get(`${url}${url.includes('?') ? '&' : '?'}size=${size}&page=${page}`);
    const rows = Array.isArray(d?.data) ? d.data : [];
    out.push(...rows);
    if (!d?.totalPages || page >= d.totalPages || !rows.length) break;
  }
  return out;
}

function valueNear(series, iso, tolDays = 50) {
  let best = null, diff = Infinity;
  const t = Date.parse(iso);
  for (const s of series) {
    const d = Math.abs(Date.parse(s.d) - t) / DAY;
    if (d < diff) { diff = d; best = s; }
  }
  return best && diff <= tolDays ? best.v : null;
}

function analyzePrices(rows, lastClose) {
  // rows: [{d, c, h, l}] tăng dần theo ngày, giá điều chỉnh (nghìn đồng)
  const n = rows.length;
  if (n < 60) return null;
  const f = isNum(lastClose) && rows[n - 1].c > 0 ? lastClose / rows[n - 1].c : 1; // quy về giá hiện tại
  const R = rows.map((r) => ({ d: r.d, c: r.c * f * 1000, h: r.h * f * 1000, l: r.l * f * 1000 }));
  const closes = R.map((r) => r.c);
  const last = closes[n - 1];
  const ma = (k) => (n >= k ? mean(closes.slice(n - k)) : null);
  const win = R.slice(-250);
  const rets = [];
  for (let i = 1; i < win.length; i++) if (win[i - 1].c > 0) rets.push(Math.log(win[i].c / win[i - 1].c));
  let peak = -Infinity, mdd = 0;
  for (const r of win) { peak = Math.max(peak, r.c); mdd = Math.max(mdd, 1 - r.c / peak); }
  const trs = [];
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const p = R[i - 1].c;
    trs.push(Math.max(R[i].h - R[i].l, Math.abs(R[i].h - p), Math.abs(R[i].l - p)));
  }
  const perf = (k) => (n > k ? last / closes[n - 1 - k] - 1 : null);
  // Chuỗi giá ~1 năm cho biểu đồ (mỗi 2 phiên một điểm): [ngày, giá nghìn đồng]
  const spark = [];
  const start = Math.max(0, n - 250);
  for (let i = start; i < n; i += 2) spark.push([R[i].d, rnd(closes[i] / 1000, 2)]);
  if ((n - 1 - start) % 2 !== 0) spark.push([R[n - 1].d, rnd(last / 1000, 2)]);
  return {
    ma20: ma(20), ma50: ma(50), ma200: ma(200),
    vol: isNum(stdev(rets)) ? stdev(rets) * Math.sqrt(250) : null,
    maxDD: mdd,
    atr: mean(trs),
    support: Math.min(...R.slice(-60).map((r) => r.l)),
    resistance: Math.max(...R.slice(-120).map((r) => r.h)),
    perf1m: perf(21), perf3m: perf(63), perf1y: perf(250),
    spark,
  };
}

function dividendInfo(list, price, today) {
  const seen = new Set();
  const cash = [], stock = [];
  for (const e of list) {
    const key = `${e.type}|${e.effectiveDate}|${e.dividend}|${e.ratio}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const payDate = e.actualDate || e.expiredDate || null;
    if (e.type === 'DIVIDEND') {
      if (!isNum(e.dividend) || e.dividend <= 0) continue;
      cash.push({ kind: 'cash', exDate: e.effectiveDate, payDate, dps: e.dividend, ratio: e.ratio, year: e.divYear || null, note: e.note || '' });
    } else {
      stock.push({ kind: 'stock', label: e.type === 'KINDDIV' ? 'Cổ phiếu thưởng' : 'Cổ tức bằng cổ phiếu', exDate: e.effectiveDate, payDate, ratio: e.ratio, note: e.note || '' });
    }
  }
  const y = +today.slice(0, 4);
  const byYear = {};
  for (const c of cash) {
    const yy = c.exDate?.slice(0, 4);
    if (yy) byYear[yy] = (byYear[yy] || 0) + c.dps;
  }
  const from = addDays(today, -365);
  const ttm = cash.filter((c) => c.exDate > from && c.exDate <= today).reduce((t, c) => t + c.dps, 0);
  const all = [...cash, ...stock];
  const upcoming = all
    .filter((e) => (e.exDate && e.exDate >= today) || (e.payDate && e.payDate >= today))
    .sort((a, b) => (a.exDate || '').localeCompare(b.exDate || ''));
  const history = all.sort((a, b) => (b.exDate || '').localeCompare(a.exDate || '')).slice(0, 14);
  return {
    ttm,
    yieldTTM: price ? ttm / price : null,
    byYear,
    lastYearDps: byYear[y - 1] || 0,
    yearsPaid: [y - 1, y - 2, y - 3].filter((k) => byYear[k] > 0).length,
    upcoming,
    history,
  };
}

// Lợi suất cổ tức "bền vững": lấy mức thấp hơn giữa 12 tháng gần nhất và trung bình 3 năm trọn vẹn,
// để cổ tức đặc biệt một lần không thổi phồng lợi nhuận kỳ vọng. Trần 10%.
function normalizedYield(div, price, today, fallback) {
  if (!price) return 0;
  const y = +today.slice(0, 4);
  const avg3 = ((div.byYear[y - 1] || 0) + (div.byYear[y - 2] || 0) + (div.byYear[y - 3] || 0)) / 3;
  if (div.ttm <= 0 && avg3 <= 0) return Math.min(or(fallback, 0), 0.1);
  return Math.min(Math.min(div.ttm || avg3, avg3 || div.ttm) / price, 0.1);
}

function analystConsensus(list, price) {
  if (!list?.length) return null;
  const byFirm = {};
  for (const r of list) {
    const k = r.firm || r.source || '?';
    if (!byFirm[k] || r.reportDate > byFirm[k].reportDate) byFirm[k] = r;
  }
  const arr = Object.values(byFirm).filter(
    (r) => isNum(r.targetPrice) && r.targetPrice > 0 && isNum(r.reportPrice) && r.reportPrice > 0 &&
      Math.abs((r.reportPrice * 1000) / price - 1) < 0.5,
  );
  if (!arr.length) return null;
  return {
    target: median(arr.map((r) => r.targetPrice * 1000)),
    count: arr.length,
    latest: arr.map((r) => r.reportDate).sort().pop(),
    firms: arr
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
      .map((r) => ({ firm: r.firm, type: r.type, date: r.reportDate, target: r.targetPrice * 1000 })),
  };
}

function computeZones(s, C) {
  const P = s.price, T = s.target, F = s.fair;
  const dy = Math.min(or(s.divYield, 0), 0.08);
  // Giá cao nhất còn đảm bảo lợi nhuận kỳ vọng ≥ minReturn (gồm cổ tức) và không vượt giá trị hợp lý
  const valCeil = Math.min(T / (1 + C.minReturn - dy), F);
  let buyHigh, buyLow;
  if (P <= valCeil) {
    // Đang rẻ theo định giá → vùng mua quanh giá hiện tại, cận dưới là vùng hỗ trợ kỹ thuật
    buyHigh = Math.min(valCeil, P * 1.02);
    buyLow = clamp(or(s.support, buyHigh * 0.93), buyHigh * 0.9, buyHigh * 0.96);
  } else {
    // Đang đắt hơn ngưỡng → chờ giá điều chỉnh về vùng mua
    buyHigh = valCeil;
    buyLow = buyHigh * 0.93;
    if (isNum(s.support) && s.support >= buyHigh * 0.88 && s.support <= buyHigh * 0.96) buyLow = s.support;
  }
  const stop = Math.max(buyLow * 0.85, Math.min(buyLow * 0.93, buyLow - 2 * or(s.atr, 0)));
  const sellLow = T * 0.95, sellHigh = T * 1.05;
  const weak = isNum(s.ma200) && P < s.ma200 * 0.95;
  let status, statusKey;
  if (P >= sellLow) { statusKey = 'sell'; status = 'Trong vùng chốt lời'; }
  else if (P > buyHigh) { statusKey = 'wait'; status = 'Chờ điều chỉnh về vùng mua'; }
  else if (weak) { statusKey = 'buyweak'; status = 'Vùng mua – xu hướng còn yếu'; }
  else { statusKey = 'buy'; status = 'Trong vùng mua'; }
  return {
    buyLow: roundPrice(buyLow), buyHigh: roundPrice(buyHigh),
    sellLow: roundPrice(sellLow), sellHigh: roundPrice(sellHigh),
    stop: roundPrice(stop), status, statusKey,
  };
}

export async function buildDataset({ get, log = () => {}, now = new Date(), config = CONFIG }) {
  const C = config;
  const today = vnToday(now);

  log('Đang tải danh sách mã HOSE và phân ngành…');
  const [stockRows, indRows] = await Promise.all([
    fetchAll(get, `${API}/stocks?q=type:stock~status:listed~floor:HOSE&fields=code,shortName,companyName,indexCode`, 1000),
    fetchAll(get, `${API}/industry_classification?q=industryLevel:2`, 100),
  ]);
  const sectorOf = {};
  for (const ind of indRows) for (const c of (ind.codeList || '').split(',')) sectorOf[c] = (ind.vietnameseName || '').trim();
  const meta = {};
  for (const s of stockRows) {
    meta[s.code] = { name: s.shortName || s.companyName, company: s.companyName, vn30: s.indexCode === 'VN30', sector: sectorOf[s.code] || 'Khác' };
  }
  const allCodes = Object.keys(meta);
  if (allCodes.length < 100) throw new Error('Không tải được danh sách mã HOSE');

  log('Đang tải giá phiên gần nhất…');
  const lastRow = await get(`${API}/stock_prices?q=code:VNM,FPT~date:gte:${addDays(today, -20)}&sort=date:desc&size=1&fields=code,date`);
  const tradingDate = lastRow?.data?.[0]?.date;
  if (!tradingDate) throw new Error('Không xác định được phiên giao dịch gần nhất');
  const priceRows = await fetchAll(get, `${API}/stock_prices?q=floor:HOSE~date:${tradingDate}&fields=code,date,close,basicPrice,change,nmVolume,nmValue`, 1000);
  const quote = {};
  for (const p of priceRows) {
    if (!isNum(p.close) || p.close <= 0) continue;
    quote[p.code] = {
      price: p.close * 1000,
      change: isNum(p.basicPrice) && p.basicPrice > 0 ? p.close / p.basicPrice - 1 : null,
      value: p.nmValue || null,
    };
  }

  log('Đang tải chỉ số tài chính (P/E, P/B, ROE, EPS, beta…)…');
  const ratios = {};
  await pool(chunk(allCodes, 80), 3, async (codes) => {
    const rows = await fetchAll(get, `${API}/ratios/latest?filter=ratioCode:${RATIO_CODES.join(',')}&where=code:${codes.join(',')}&order=reportDate&fields=code,ratioCode,value`);
    for (const r of rows) (ratios[r.code] ||= {})[r.ratioCode] = r.value;
  });

  const universe = allCodes.filter((c) => {
    const r = ratios[c], q = quote[c];
    if (!r || !q) return false;
    const liq = or(r.NMVOLUME_AVG_CR_10D, 0) * q.price;
    return r.MARKETCAP >= C.minMarketCap && liq >= C.minLiquidity && r.EPS_TR > 0 &&
      r.PRICE_TO_EARNINGS > 0 && r.PRICE_TO_EARNINGS < 60 && r.BVPS_CR > 0;
  });
  if (universe.length < 20) throw new Error('Số mã qua vòng lọc quá ít — dữ liệu nguồn có thể đang lỗi');
  log(`${universe.length}/${allCodes.length} mã đạt điều kiện vốn hoá & thanh khoản. Đang tải lịch sử giá…`);

  const hist = {};
  await pool(chunk(universe, 10), 4, async (codes) => {
    const rows = await fetchAll(get, `${API}/stock_prices?q=code:${codes.join(',')}~date:gte:${addDays(today, -400)}&sort=date&fields=code,date,adClose,adHigh,adLow`, 10000);
    for (const r of rows) (hist[r.code] ||= []).push({ d: r.date, c: r.adClose, h: r.adHigh, l: r.adLow });
  });

  log('Đang tải lịch sử định giá (P/E, P/B 3 năm) và EPS…');
  const valHist = {};
  await pool(chunk(universe, 5), 4, async (codes) => {
    const rows = await fetchAll(get, `${API}/ratios?q=code:${codes.join(',')}~ratioCode:PRICE_TO_EARNINGS,PRICE_TO_BOOK~reportDate:gte:${addDays(today, -3 * 365)}&fields=code,ratioCode,value`, 10000);
    for (const r of rows) ((valHist[r.code] ||= { PRICE_TO_EARNINGS: [], PRICE_TO_BOOK: [] })[r.ratioCode] ||= []).push(r.value);
  });
  const fundHist = {};
  await pool(chunk(universe, 40), 3, async (codes) => {
    const rows = await fetchAll(get, `${API}/ratios?q=code:${codes.join(',')}~ratioCode:EPS_TR~reportDate:gte:${addDays(today, -4 * 365 - 60)}&fields=code,ratioCode,reportDate,value`, 10000);
    for (const r of rows) (fundHist[r.code] ||= []).push({ d: r.reportDate, v: r.value });
  });

  log('Đang tải lịch sử cổ tức và giá mục tiêu của các CTCK…');
  const [events, recs] = await Promise.all([
    fetchAll(get, `${API}/events?q=type:DIVIDEND,STOCKDIV,KINDDIV~locale:VN~effectiveDate:gte:${addDays(today, -4 * 365)}&sort=effectiveDate:desc&fields=code,type,note,dividend,ratio,divYear,effectiveDate,expiredDate,actualDate`, 5000),
    fetchAll(get, `${API}/recommendations?q=reportDate:gte:${addDays(today, -180)}`, 2000).catch(() => []),
  ]);
  const evBy = {};
  for (const e of events) if (meta[e.code]) (evBy[e.code] ||= []).push(e);
  const recBy = {};
  for (const r of recs) if (meta[r.code]) (recBy[r.code] ||= []).push(r);

  log('Đang chấm điểm và tính vùng mua/bán…');
  // ---------- Chỉ số từng mã ----------
  const S = {};
  for (const code of universe) {
    const r = ratios[code], q = quote[code], m = meta[code];
    const price = q.price;
    const tech = analyzePrices((hist[code] || []).sort((a, b) => a.d.localeCompare(b.d)), price / 1000);
    if (!tech) continue;
    const eps = (fundHist[code] || []).filter((x) => isNum(x.v)).sort((a, b) => a.d.localeCompare(b.d));
    const epsNow = r.EPS_TR;
    const lastD = eps.length ? eps[eps.length - 1].d : today;
    const e1 = valueNear(eps, addDays(lastD, -365));
    const e3 = valueNear(eps, addDays(lastD, -3 * 365));
    const g1 = isNum(e1) && e1 > 0 ? epsNow / e1 - 1 : null;
    const cagr3 = isNum(e3) && e3 > 0 && epsNow > 0 ? (epsNow / e3) ** (1 / 3) - 1 : null;
    const eps3y = eps.filter((x) => x.d >= addDays(lastD, -3 * 365 - 10)).map((x) => x.v);
    const epsNeg = eps3y.filter((v) => v <= 0).length;
    const epsCV = eps3y.length >= 4 && mean(eps3y) > 0 ? stdev(eps3y) / mean(eps3y) : null;
    const vh = valHist[code] || {};
    const div = dividendInfo(evBy[code] || [], price, today);
    S[code] = {
      code, ...m, price, change: q.change,
      mcap: r.MARKETCAP, liq: or(r.NMVOLUME_AVG_CR_10D, 0) * price, beta: r.BETA, freefloat: r.FREEFLOAT, foreign: r.FOREIGN_OWNERSHIP,
      high52: r.PRICE_HIGHEST_CR_52W, low52: r.PRICE_LOWEST_CR_52W,
      pe: r.PRICE_TO_EARNINGS, pb: r.PRICE_TO_BOOK, eps: epsNow, bvps: r.BVPS_CR,
      roe: r.ROAE_TR_AVG5Q, roa: r.ROAA_TR_AVG5Q,
      g1, cagr3, epsNeg, epsCV,
      peMed: median((vh.PRICE_TO_EARNINGS || []).filter((v) => v > 0 && v <= 80)),
      pbMed: median((vh.PRICE_TO_BOOK || []).filter((v) => v > 0 && v <= 15)),
      divYield: normalizedYield(div, price, today, r.DIVIDEND_YIELD),
      div,
      ...tech,
      analyst: analystConsensus(recBy[code], price),
    };
  }
  const list = Object.values(S);

  // Trung vị P/E, P/B theo ngành (trong vũ trụ lọc) để làm mềm định giá
  const bySector = {};
  for (const s of list) (bySector[s.sector] ||= []).push(s);
  const allPE = median(list.map((s) => s.pe)), allPB = median(list.map((s) => s.pb));
  const secPE = {}, secPB = {};
  for (const [k, arr] of Object.entries(bySector)) {
    secPE[k] = arr.length >= 3 ? median(arr.map((s) => s.pe)) : allPE;
    secPB[k] = arr.length >= 3 ? median(arr.map((s) => s.pb)) : allPB;
  }

  // ---------- Định giá & giá mục tiêu 12 tháng ----------
  for (const s of list) {
    // Tăng trưởng EPS ước tính 12 tháng: ưu tiên CAGR 3 năm; EPS tăng đột biến (>100%) coi là bất thường
    s.spike = isNum(s.g1) && s.g1 > 1;
    const g = isNum(s.g1) && isNum(s.cagr3) ? 0.3 * s.g1 + 0.7 * s.cagr3 : or(s.cagr3, or(s.g1, 0));
    s.gEst = clamp(g, -0.15, s.spike ? 0.08 : 0.2);
    // P/E, P/B hợp lý: chỉ giả định hồi về một nửa khoảng cách tới mức trung bình (3 năm của mã + ngành)
    const peAnchor = 0.6 * or(s.peMed, s.pe) + 0.4 * secPE[s.sector];
    const pbAnchor = 0.6 * or(s.pbMed, s.pb) + 0.4 * secPB[s.sector];
    const fairPE = clamp(s.pe + 0.5 * (peAnchor - s.pe), 4, 25);
    const fairPB = clamp(s.pb + 0.5 * (pbAnchor - s.pb), 0.5, 4.5);
    const peFair = fairPE * s.eps;
    const pbFair = fairPB * s.bvps;
    const bvGrowth = clamp(or(s.roe, 0) - or(s.divYield, 0) * or(s.pb, 0), 0, 0.25);
    let fair, modelTarget, method;
    if (FIN_SECTORS.has(s.sector)) {
      fair = pbFair; modelTarget = pbFair * (1 + bvGrowth); method = 'P/B';
    } else if (DUAL_SECTORS.has(s.sector)) {
      fair = (peFair + pbFair) / 2; modelTarget = (peFair * (1 + s.gEst) + pbFair * (1 + bvGrowth)) / 2; method = 'P/E + P/B';
    } else {
      fair = peFair; modelTarget = peFair * (1 + s.gEst); method = 'P/E';
    }
    s.fairPE = fairPE; s.fairPB = fairPB; s.method = method;
    s.fair = fair; s.modelTarget = modelTarget;
    const aw = s.analyst ? (s.analyst.count >= 2 ? C.analystWeight + 0.1 : C.analystWeight) : 0;
    let target = (1 - aw) * modelTarget + aw * (s.analyst?.target || 0);
    target = clamp(target, s.price * 0.6, s.price * (1 + C.maxUpside));
    s.target = target;
    s.upside = target / s.price - 1;
    s.er = s.upside + or(s.divYield, 0);
    s.peg = s.gEst > 0.02 ? s.pe / (s.gEst * 100) : 5;
  }

  // ---------- Chấm điểm theo phân vị trong vũ trụ ----------
  const rk = (f) => ranker(list.map(f));
  const R = {
    roe: rk((s) => s.roe), roa: rk((s) => s.roa), g1: rk((s) => s.g1), cagr3: rk((s) => s.cagr3),
    disc: rk((s) => -s.price / s.fair), peg: rk((s) => -s.peg),
    beta: rk((s) => -s.beta), vol: rk((s) => -s.vol), mdd: rk((s) => -s.maxDD),
    mcap: rk((s) => Math.log(s.mcap)), liq: rk((s) => Math.log(s.liq || 1)), dy: rk((s) => s.divYield),
  };
  const W = C.weights;
  for (const s of list) {
    const stab = isNum(s.epsCV) ? clamp(100 - s.epsCV * 200, 0, 100) : 50;
    const quality = 0.5 * or(R.roe(s.roe), 40) + 0.2 * or(R.roa(s.roa), 40) + 0.3 * stab - (s.epsNeg ? 25 : 0);
    let growth = 0.5 * or(R.g1(s.g1), 40) + 0.5 * or(R.cagr3(s.cagr3), 40);
    if (s.spike) growth = Math.min(growth, 60); // tăng đột biến chưa chắc bền vững
    const value = 0.6 * or(R.disc(-s.price / s.fair), 40) + 0.4 * or(R.peg(-s.peg), 40);
    const trend = isNum(s.ma200) ? (s.price >= s.ma200 ? 100 : clamp(100 - (1 - s.price / s.ma200) * 400, 0, 100)) : 50;
    const safety = 0.2 * or(R.beta(-s.beta), 40) + 0.25 * or(R.vol(-s.vol), 40) + 0.15 * or(R.mdd(-s.maxDD), 40) +
      0.15 * or(R.mcap(Math.log(s.mcap)), 40) + 0.1 * or(R.liq(Math.log(s.liq || 1)), 40) + 0.15 * trend;
    const dividend = 0.6 * or(R.dy(s.divYield), 0) + 0.4 * (s.div.yearsPaid / 3) * 100;
    const sc = { quality, growth, value, safety, dividend };
    for (const k in sc) sc[k] = clamp(sc[k], 0, 100);
    sc.total = W.quality * sc.quality + W.growth * sc.growth + W.value * sc.value + W.safety * sc.safety + W.dividend * sc.dividend;
    s.scores = sc;

    const flags = [];
    if (or(s.roe, 0) < 0.08) flags.push('ROE thấp (<8%)');
    if (isNum(s.g1) && s.g1 < -0.2) flags.push('EPS giảm >20% so với cùng kỳ');
    if (s.spike) flags.push('EPS tăng đột biến >100% – có thể do lợi nhuận bất thường');
    if (s.epsNeg) flags.push('Có quý EPS âm trong 3 năm');
    if (isNum(s.ma200) && s.price < s.ma200 * 0.95) flags.push('Giá dưới MA200 (xu hướng giảm)');
    if (or(s.vol, 0) > 0.45) flags.push('Biến động giá cao');
    if (or(s.beta, 1) > 1.5) flags.push('Beta cao (>1,5)');
    if (s.price > s.fair * 1.15) flags.push('Giá cao hơn giá trị hợp lý');
    if (or(s.maxDD, 0) > 0.4) flags.push('Từng giảm >40% trong 1 năm');
    s.flags = flags;
    s.hardFlag = or(s.roe, 0) < 0.08 || (isNum(s.g1) && s.g1 < -0.25);
    s.zones = computeZones(s, C);
  }

  // ---------- Danh sách ----------
  const top20 = [];
  const sec20 = {};
  for (const s of list.filter((x) => !x.hardFlag && x.scores.quality >= 40).sort((a, b) => b.scores.total - a.scores.total)) {
    if (top20.length >= 20) break;
    if ((sec20[s.sector] || 0) >= C.maxPerSector.top20) continue;
    sec20[s.sector] = (sec20[s.sector] || 0) + 1;
    top20.push(s.code);
  }

  const top10 = [];
  const used = new Set();
  const sec10 = {};
  for (const t of C.top10Tiers) {
    const cands = list
      .filter((s) => !used.has(s.code) && !s.hardFlag && !s.spike && s.er >= t.erMin && s.er <= t.erMax &&
        s.scores.safety >= t.safety && s.scores.quality >= t.quality &&
        (!t.trend || !isNum(s.ma200) || s.price >= s.ma200 * 0.97))
      .sort((a, b) => (0.5 * b.scores.safety + 0.5 * b.scores.total) - (0.5 * a.scores.safety + 0.5 * a.scores.total));
    for (const s of cands) {
      if (top10.length >= 10) break;
      if ((sec10[s.sector] || 0) >= C.maxPerSector.top10) continue;
      sec10[s.sector] = (sec10[s.sector] || 0) + 1;
      top10.push({ code: s.code, tier: t.key });
      used.add(s.code);
    }
  }

  // ---------- Lịch cổ tức sắp tới (toàn sàn HOSE) ----------
  const calendar = [];
  for (const [code, evs] of Object.entries(evBy)) {
    const price = quote[code]?.price || null;
    const info = dividendInfo(evs, price, today);
    for (const e of info.upcoming) {
      calendar.push({
        code, name: meta[code].name, kind: e.kind, label: e.kind === 'cash' ? 'Cổ tức tiền mặt' : e.label,
        exDate: e.exDate, payDate: e.payDate, dps: e.dps || null, ratio: e.ratio || null, note: e.note,
        price, yield: e.dps && price ? e.dps / price : null, inUniverse: !!S[code],
      });
    }
  }
  calendar.sort((a, b) => (a.exDate || '').localeCompare(b.exDate || '') || a.code.localeCompare(b.code));

  // ---------- Thu gọn số liệu để xuất JSON ----------
  const stocks = {};
  for (const s of list) {
    stocks[s.code] = {
      code: s.code, name: s.name, company: s.company, sector: s.sector, vn30: s.vn30,
      price: s.price, change: rnd(s.change, 4),
      mcap: rnd(s.mcap / 1e9), liq: rnd(s.liq / 1e9, 1), beta: rnd(s.beta, 2), foreign: rnd(s.foreign, 4),
      high52: rnd(s.high52), low52: rnd(s.low52),
      pe: rnd(s.pe, 2), pb: rnd(s.pb, 2), eps: rnd(s.eps), bvps: rnd(s.bvps),
      roe: rnd(s.roe, 4), roa: rnd(s.roa, 4), g1: rnd(s.g1, 4), cagr3: rnd(s.cagr3, 4), gEst: rnd(s.gEst, 4),
      peMed: rnd(s.peMed, 2), pbMed: rnd(s.pbMed, 2), fairPE: rnd(s.fairPE, 2), fairPB: rnd(s.fairPB, 2), method: s.method,
      fair: roundPrice(s.fair), modelTarget: roundPrice(s.modelTarget), target: roundPrice(s.target),
      upside: rnd(s.upside, 4), divYield: rnd(s.divYield, 4), er: rnd(s.er, 4),
      ma20: roundPrice(s.ma20), ma50: roundPrice(s.ma50), ma200: roundPrice(s.ma200),
      vol: rnd(s.vol, 4), maxDD: rnd(s.maxDD, 4), atr: rnd(s.atr), support: roundPrice(s.support), resistance: roundPrice(s.resistance),
      perf1m: rnd(s.perf1m, 4), perf3m: rnd(s.perf3m, 4), perf1y: rnd(s.perf1y, 4),
      scores: Object.fromEntries(Object.entries(s.scores).map(([k, v]) => [k, rnd(v, 1)])),
      zones: s.zones, flags: s.flags,
      analyst: s.analyst ? { ...s.analyst, target: roundPrice(s.analyst.target) } : null,
      div: {
        ttm: s.div.ttm, yieldTTM: rnd(s.div.yieldTTM, 4), byYear: s.div.byYear, lastYearDps: s.div.lastYearDps,
        yearsPaid: s.div.yearsPaid, upcoming: s.div.upcoming, history: s.div.history,
      },
      spark: s.spark,
    };
  }

  log('Hoàn tất.');
  return {
    version: 1,
    generatedAt: now.toISOString(),
    today, tradingDate,
    source: 'VNDirect Finfo API (api-finfo.vndirect.com.vn)',
    config: C,
    hoseCount: allCodes.length,
    universeCount: list.length,
    top20, top10,
    stocks, calendar,
  };
}
