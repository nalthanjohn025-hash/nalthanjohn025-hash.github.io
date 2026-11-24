// Kiểm tra chất lượng dữ liệu sau khi tính xong. Thoát với mã lỗi 1 nếu có lỗi nghiêm trọng
// (workflow sẽ giữ nguyên dữ liệu cũ). Cảnh báo (WARN) chỉ in ra, không chặn.
// Chạy: node scripts/check-data.js [đường dẫn stocks.json]
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || join(root, 'data', 'stocks.json');
const d = JSON.parse(await readFile(file, 'utf8'));

const errors = [];
const warns = [];
const DAY = 86400000;

// 1. Phiên giao dịch gần nhất không quá cũ (cho phép cuối tuần + ngày lễ ngắn)
const age = (Date.parse(d.today) - Date.parse(d.tradingDate)) / DAY;
if (!(age >= 0 && age <= 5)) errors.push(`Phiên giao dịch ${d.tradingDate} cách ngày chạy ${d.today} tới ${age} ngày`);

// 2. Danh sách tham chiếu tồn tại
for (const c of d.top20) if (!d.stocks[c]) errors.push(`Top 20 có mã ${c} không có trong stocks`);
for (const t of d.top10) if (!d.stocks[t.code]) errors.push(`Mã nổi bật có mã ${t.code} không có trong stocks`);
if (d.top20.length < 15) errors.push(`Top 20 chỉ có ${d.top20.length} mã`);

// 3. Số liệu từng mã
for (const s of Object.values(d.stocks)) {
  if (!(s.price > 0)) errors.push(`${s.code}: giá không hợp lệ`);
  const z = s.zones;
  if (!z || !(z.buyLow <= z.buyHigh) || !(z.stop < z.buyLow) || !(z.sellLow <= z.sellHigh)) errors.push(`${s.code}: vùng mua/bán/cắt lỗ không hợp lệ ${JSON.stringify(z)}`);
  // Lợi suất 12 tháng cao bất thường phải được gắn cờ "đợt trả lớn"
  if (s.div.yieldTTM > 0.12 && !s.div.special) warns.push(`${s.code}: lợi suất 12 tháng ${(s.div.yieldTTM * 100).toFixed(1)}% nhưng không gắn cờ special`);
  // Mô hình có tính cổ tức nhưng 12 tháng qua không chia tiền mặt
  if (s.divYield > 0 && s.div.ttm === 0 && s.div.yearsPaid > 0) errors.push(`${s.code}: tính lợi suất ${s.divYield} dù 12 tháng qua không chia tiền mặt`);
}

// 4. Cảnh báo dấu hiệu mô hình "bão hoà" (không chặn)
const t20 = d.top20.map((c) => d.stocks[c]);
const inBuy = t20.filter((s) => s.zones.statusKey === 'buy' || s.zones.statusKey === 'buyweak').length;
if (t20.length && inBuy / t20.length > 0.8) warns.push(`${inBuy}/${t20.length} mã Top 20 cùng ở vùng mua (>80%)`);
const capped = t20.filter((s) => s.upside >= d.config.maxUpside - 0.005).length;
if (capped >= 5) warns.push(`${capped} mã Top 20 chạm trần tiềm năng tăng giá +${d.config.maxUpside * 100}%`);
if (d.top10.length < 10) warns.push(`Chỉ có ${d.top10.length} mã nổi bật (ít hơn 10)`);

for (const w of warns) console.log('WARN  ', w);
for (const e of errors) console.log('LỖI   ', e);
console.log(`Kiểm tra xong: ${errors.length} lỗi, ${warns.length} cảnh báo (phiên ${d.tradingDate}, ${Object.keys(d.stocks).length} mã).`);
process.exit(errors.length ? 1 : 0);
