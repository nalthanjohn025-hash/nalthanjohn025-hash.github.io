// In kết quả backtest ra dạng bảng chữ để đọc nhanh. Chạy: node scripts/backtest/print-report.mjs [nhãn]
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const label = process.argv[2] || 'goc';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const r = JSON.parse(await readFile(join(root, 'backtest-results', `ket-qua-${label}.json`), 'utf8'));
const p = (x, d = 1) => (x == null ? '—' : (x * 100).toFixed(d) + '%');
const sp = (x, d = 1) => (x == null ? '—' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');

console.log(`# Backtest "${r.label}" — ${r.signals} tín hiệu cuối tháng (${r.firstSignal} → ${r.lastSignal}), giá đến ${r.lastPriceDate}`);
console.log(`Tham số: ${JSON.stringify(r.params)} · số mã trung bình/tín hiệu: ${r.avgUniverse.toFixed(0)}`);
console.log(`Tỷ lệ mã ở vùng mua (trung bình): toàn bộ ${p(r.saturation.avgBuyShareUniverse, 0)}, Top 20 ${p(r.saturation.avgBuyShareTop20, 0)}\n`);

for (const h of [3, 6, 12]) {
  console.log(`## Nhóm theo lợi suất ${h} tháng (sau phí ${(r.params.cost * 100).toFixed(1)}%; "hơn mốc" = so với trung bình toàn bộ mã đạt lọc)`);
  console.log('| Nhóm | Số tín hiệu | Số mã TB | Lợi suất | Mốc | Hơn mốc | ±SE | % lần hơn mốc | Tệ nhất |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const c of r.cohorts) {
    const s = c.byH[h];
    if (!s) { console.log(`| ${c.name} | — | | | | | | | |`); continue; }
    console.log(`| ${c.name} | ${s.nSignals} (~${s.nEff} độc lập) | ${s.avgNames} | ${sp(s.net)} | ${sp(s.universe - 0.006)} | ${sp(s.excess)} | ${p(s.excessSE)} | ${p(s.beatRate, 0)} | ${sp(s.worst)} |`);
  }
  console.log('');
}
console.log('## Hiệu chuẩn: chia mã thành 5 nhóm theo "LN kỳ vọng" (nhóm 1 thấp nhất), lợi suất thật sau 12 tháng');
console.log('| Nhóm | Số mẫu | LN kỳ vọng TB | Lợi suất thật TB | Hơn mặt bằng |');
console.log('|---|---|---|---|---|');
for (const q of r.quintilesByER12m['12']) console.log(`| ${q.q} | ${q.n} | ${p(q.avgER)} | ${sp(q.avgRealized)} | ${sp(q.avgExcess)} |`);

for (const h of [3, 12]) {
  console.log(`\n## Sức dự báo (hệ số tương quan hạng, IC) với lợi suất ${h} tháng — >0 nghĩa là điểm cao đi cùng lợi suất cao`);
  console.log('| Chỉ số | IC trung bình | % tháng IC>0 | ±SE (hiệu chỉnh chồng lấn) |');
  console.log('|---|---|---|---|');
  for (const [k, v] of Object.entries(r.ic[h])) console.log(`| ${k} | ${v ? v.mean.toFixed(3) : '—'} | ${v ? p(v.pos, 0) : '—'} | ${v ? v.se.toFixed(3) : '—'} |`);
}

console.log('\n## Mô phỏng giao dịch theo vùng mua → vùng bán/cắt lỗ (tối đa 12 tháng, sau phí)');
console.log('| Nhóm | Số lệnh | Lợi suất TB/lệnh | Trung vị | Tỷ lệ lãi | Chạm vùng bán | Cắt lỗ | Hết 12T | Ngày giữ TB | Lãi TB | Lỗ TB | Mua-giữ 12T cùng mã |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const z of r.zones) {
  if (!z.n) { console.log(`| ${z.name} | 0 |`); continue; }
  console.log(`| ${z.name} | ${z.n} | ${sp(z.avgRet)} | ${sp(z.medianRet)} | ${p(z.winRate, 0)} | ${p(z.target, 0)} | ${p(z.stop, 0)} | ${p(z.timeout, 0)} | ${z.avgDays.toFixed(0)} | ${sp(z.avgWin)} | ${sp(z.avgLoss)} | ${sp(z.buyHold12m)} |`);
}
console.log('\n## Theo năm của tín hiệu: Top 20 vs toàn bộ mã đạt lọc, lợi suất 12 tháng (chưa trừ phí)');
for (const [y, v] of Object.entries(r.yearly)) console.log(`${y}: Top 20 ${sp(v.top20)} · mặt bằng ${sp(v.universe)} · ${v.n} tín hiệu`);
console.log('\n## Sức dự báo của "LN kỳ vọng" theo năm tín hiệu (IC trung bình)');
for (const h of [6, 12]) console.log(`${h} tháng: ` + Object.entries(r.icByYear[h]).map(([y, v]) => `${y}: ${v.ic.toFixed(3)} (${v.n} tháng)`).join(' · '));
console.log('\n## Chênh lệch lợi suất 12 tháng giữa nhóm LN kỳ vọng cao nhất (20%) và thấp nhất (20%), theo năm');
for (const [y, v] of Object.entries(r.spreadYear)) console.log(`${y}: ${sp(v.spread)} · ${p(v.pos, 0)} số tháng nhóm cao thắng nhóm thấp (${v.n} tháng)`);
console.log('\n## Độ "bão hoà" (tỷ lệ mã ở vùng mua) lúc tín hiệu và lợi suất mặt bằng 6/12 tháng sau');
const sv = r.satVsFuture.filter((x) => x.uni6 != null).sort((a, b) => a.buyShare - b.buyShare);
const third = Math.ceil(sv.length / 3);
for (const [name, arr] of [['Thấp', sv.slice(0, third)], ['Vừa', sv.slice(third, 2 * third)], ['Cao', sv.slice(2 * third)]]) {
  const m = (k) => { const a = arr.map((x) => x[k]).filter((x) => x != null); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  console.log(`${name}: tỷ lệ mã ở vùng mua ${p(Math.min(...arr.map((x) => x.buyShare)), 0)}–${p(Math.max(...arr.map((x) => x.buyShare)), 0)} · mặt bằng +6T ${sp(m('uni6'))} · +12T ${sp(m('uni12'))} · ${arr.length} tín hiệu`);
}
const last = r.satVsFuture[r.satVsFuture.length - 1];
console.log(`Tín hiệu mới nhất (${last.asOf}): ${p(last.buyShare, 0)} số mã ở vùng mua`);
