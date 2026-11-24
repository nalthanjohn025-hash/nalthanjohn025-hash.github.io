// Tải toàn bộ dữ liệu lịch sử cần cho backtest từ VNDirect Finfo API và lưu vào thư mục cache.
// Chạy một lần (mất vài phút): node scripts/backtest/fetch-history.mjs
// Thư mục cache mặc định: .cache/backtest (có thể đổi bằng biến môi trường BT_CACHE).
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE = resolve(process.env.BT_CACHE || join(root, '.cache', 'backtest'));
const API = 'https://api-finfo.vndirect.com.vn/v4';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
  Accept: 'application/json',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;

async function get(url, tries = 5) {
  for (let i = 1; ; i++) {
    try {
      calls++;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(90000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i >= tries) throw new Error(`${err.message} — ${url.slice(0, 200)}`);
      await sleep(2000 * i);
    }
  }
}
async function fetchAll(url, size = 10000) {
  const out = [];
  for (let page = 1; page <= 60; page++) {
    const d = await get(`${url}${url.includes('?') ? '&' : '?'}size=${size}&page=${page}`);
    const rows = Array.isArray(d?.data) ? d.data : [];
    out.push(...rows);
    if (!d?.totalPages || page >= d.totalPages || !rows.length) break;
  }
  return out;
}
function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
async function pool(items, n, fn) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); done++; if (done % 10 === 0) process.stdout.write(`  ${done}/${items.length}\r`); }
  }));
  process.stdout.write('\n');
}
const save = (name, data) => writeFile(join(CACHE, name), JSON.stringify(data));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(CACHE, { recursive: true });
  const t0 = Date.now();
  const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

  log('Danh sách mã HOSE (gồm cả mã đã hủy niêm yết) và phân ngành…');
  const stocks = await fetchAll(`${API}/stocks?q=type:stock~floor:HOSE&fields=code,shortName,companyName,indexCode,status,listedDate,delistedDate`, 1000);
  const industry = await fetchAll(`${API}/industry_classification?q=industryLevel:2`, 100);
  await save('stocks.json', stocks);
  await save('industry.json', industry);
  const codes = stocks.map((s) => s.code);
  log(`${codes.length} mã (đang niêm yết: ${stocks.filter((s) => s.status === 'listed').length}).`);

  log('Giá lịch sử (từ 2022-01-01)…');
  const prices = {};
  await pool(chunk(codes, 8), 3, async (cs) => {
    const rows = await fetchAll(`${API}/stock_prices?q=code:${cs.join(',')}~date:gte:2022-01-01&sort=date&fields=code,date,close,basicPrice,nmVolume,nmValue,adClose,adHigh,adLow`);
    for (const r of rows) {
      const p = (prices[r.code] ||= { d: [], c: [], b: [], v: [], val: [], ac: [], ah: [], al: [] });
      p.d.push(r.date); p.c.push(r.close); p.b.push(r.basicPrice); p.v.push(r.nmVolume); p.val.push(r.nmValue);
      p.ac.push(r.adClose); p.ah.push(r.adHigh); p.al.push(r.adLow);
    }
  });
  await save('prices.json', prices);
  log(`Giá: ${Object.keys(prices).length} mã.`);

  log('P/E, P/B hằng ngày (từ 2019-12)…');
  const daily = {};
  const add = (store, r) => ((store[r.code] ||= {})[r.ratioCode] ||= []).push([r.reportDate, r.value]);
  await pool(chunk(codes, 5), 3, async (cs) => {
    const rows = await fetchAll(`${API}/ratios?q=code:${cs.join(',')}~ratioCode:PRICE_TO_EARNINGS,PRICE_TO_BOOK~reportDate:gte:2019-12-01&fields=code,ratioCode,reportDate,value`);
    for (const r of rows) add(daily, r);
  });
  log('Vốn hoá, beta, BVPS hằng ngày (từ 2022-11)…');
  await pool(chunk(codes, 5), 3, async (cs) => {
    const rows = await fetchAll(`${API}/ratios?q=code:${cs.join(',')}~ratioCode:MARKETCAP,BETA,BVPS_CR~reportDate:gte:2022-11-01&fields=code,ratioCode,reportDate,value`);
    for (const r of rows) add(daily, r);
  });
  await save('daily.json', daily);

  log('EPS, ROE, ROA theo quý (từ 2017)…');
  const quarterly = {};
  await pool(chunk(codes, 30), 3, async (cs) => {
    const rows = await fetchAll(`${API}/ratios?q=code:${cs.join(',')}~ratioCode:EPS_TR,ROAE_TR_AVG5Q,ROAA_TR_AVG5Q~reportDate:gte:2017-01-01&fields=code,ratioCode,reportDate,value`);
    for (const r of rows) add(quarterly, r);
  });
  await save('quarterly.json', quarterly);

  log('Cổ tức và giá mục tiêu CTCK…');
  const events = await fetchAll(`${API}/events?q=type:DIVIDEND,STOCKDIV,KINDDIV~locale:VN~effectiveDate:gte:2018-06-01&sort=effectiveDate:desc&fields=code,type,note,dividend,ratio,divYear,effectiveDate,expiredDate,actualDate`, 5000);
  const recs = await fetchAll(`${API}/recommendations?q=reportDate:gte:2022-01-01`, 2000).catch(() => []);
  await save('events.json', events);
  await save('recs.json', recs);
  log(`Xong: ${events.length} sự kiện cổ tức, ${recs.length} khuyến nghị CTCK, ${calls} lượt gọi API. Cache: ${CACHE}`);
}
