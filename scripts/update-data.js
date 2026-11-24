// Lấy dữ liệu mới, chấm điểm và ghi ra data/stocks.json.
// Chạy: node scripts/update-data.js   (cần Node.js 18 trở lên, không cần cài thêm thư viện)
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDataset } from '../assets/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
  Accept: 'application/json',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;

async function get(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      calls++;
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i >= tries) throw new Error(`${err.message} — ${url.slice(0, 160)}`);
      await sleep(1500 * i);
    }
  }
}

const t0 = Date.now();
const data = await buildDataset({ get, log: (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`) });
if (data.universeCount < 30 || data.top20.length < 10) {
  console.error('Dữ liệu bất thường, không ghi đè file cũ.');
  process.exit(1);
}
await mkdir(join(root, 'data'), { recursive: true });
await writeFile(join(root, 'data', 'stocks.json'), JSON.stringify(data));

// Bản chụp gọn theo phiên giao dịch, dùng để kiểm chứng mô hình (backtest/forward test) sau này.
// Mỗi phiên một file, ghi đè nếu chạy lại trong cùng phiên.
await mkdir(join(root, 'data', 'history'), { recursive: true });
const snap = {
  tradingDate: data.tradingDate,
  generatedAt: data.generatedAt,
  top20: data.top20,
  top10: data.top10,
  stocks: Object.fromEntries(
    Object.values(data.stocks).map((s) => [s.code, {
      price: s.price, er: s.er, upside: s.upside, divYield: s.divYield, target: s.target, fair: s.fair,
      total: s.scores?.total, safety: s.scores?.safety, status: s.zones?.statusKey,
      buyLow: s.zones?.buyLow, buyHigh: s.zones?.buyHigh, sellLow: s.zones?.sellLow, sellHigh: s.zones?.sellHigh, stop: s.zones?.stop,
      ma200: s.ma200,
    }]),
  ),
};
await writeFile(join(root, 'data', 'history', `${data.tradingDate}.json`), JSON.stringify(snap));
console.log(`Đã ghi data/stocks.json — phiên ${data.tradingDate}, ${data.universeCount} mã, top20=${data.top20.length}, top10=${data.top10.length}, ${data.calendar.length} sự kiện cổ tức, ${calls} lượt gọi API, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
