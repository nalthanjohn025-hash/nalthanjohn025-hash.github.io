import { buildDataset, vnToday } from './engine.js';

// ---------- Định dạng ----------
const $ = (s, el = document) => el.querySelector(s);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const fP = (v) => (isNum(v) ? nf0.format(v) : '—');
const fX = (v) => (isNum(v) ? nf2.format(v) : '—');
const fPct = (v, d = 1, sign = false) =>
  isNum(v) ? (sign && v > 0 ? '+' : '') + (v * 100).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%' : '—';
const fDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const fBn = (v) => (isNum(v) ? nf0.format(v) + ' tỷ' : '—');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dirCls = (v) => (isNum(v) ? (v > 0 ? 'up' : v < 0 ? 'down' : '') : '');
const arrow = (v) => (isNum(v) ? (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '■ ') : '');

const state = { data: null, list: [], tab: 'top20', sort: { key: 'total', dir: -1 } };
const CACHE_KEY = 'hose-dataset-v1';

function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } }
function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

// ---------- Thành phần nhỏ ----------
function scoreBar(v) {
  return `<span class="score" title="${fX(v)}/100"><span class="track"><span class="fill" style="width:${Math.max(0, Math.min(100, v || 0))}%"></span></span><b>${isNum(v) ? Math.round(v) : '—'}</b></span>`;
}
function statusBadge(z) {
  return `<span class="status ${z.statusKey}"><span class="dot" aria-hidden="true"></span>${esc(z.status)}</span>`;
}
function tierBadge(t) {
  return t === 'strict' ? '<span class="tier strict">✓ Đạt đủ tiêu chí</span>' : '<span class="tier relaxed">Nới lỏng tiêu chí</span>';
}
function nextDiv(s) {
  const up = s.div.upcoming?.[0];
  if (up) {
    const what = up.kind === 'cash' ? `${fP(up.dps)} đ/cp` : `${esc(up.label)} ${fX(up.ratio)}%`;
    return `<span class="nowrap"><b>Sắp tới:</b> ${what}</span><div class="sub">GDKHQ ${fDate(up.exDate)} · TT ${fDate(up.payDate)}</div>`;
  }
  const last = s.div.history?.find((h) => h.kind === 'cash');
  if (last) return `<span class="nowrap">Gần nhất: ${fP(last.dps)} đ/cp</span><div class="sub">GDKHQ ${fDate(last.exDate)} · TT ${fDate(last.payDate)}</div>`;
  return '<span class="sub">Chưa có cổ tức tiền mặt</span>';
}
function divCell(s) {
  const y = +state.data.today.slice(0, 4) - 1;
  const dps = s.div.lastYearDps;
  return `${dps ? `<b>${fP(dps)} đ</b>` : '<span class="sub">0 đ</span>'}<div class="sub">năm ${y} · lợi suất ${fPct(s.div.yieldTTM)}</div>`;
}

// ---------- Cột bảng ----------
const COL = {
  rank: { label: '#', cls: 'rank', html: (s, i) => i + 1 },
  code: {
    label: 'Mã', cls: 'head', sort: (s) => s.code,
    html: (s, i, extra) => `<span class="code">${esc(s.code)}</span>${s.vn30 ? '<span class="tag">VN30</span>' : ''}${extra?.tier ? ' ' + tierBadge(extra.tier) : ''}<div class="sub">${esc(s.name)} · ${esc(s.sector)}</div>`,
  },
  price: {
    label: 'Giá (đ)', cls: 'num', sort: (s) => s.price,
    html: (s) => `<b>${fP(s.price)}</b><div class="sub ${dirCls(s.change)}">${arrow(s.change)}${fPct(s.change, 1, true)}</div>`,
  },
  total: { label: 'Điểm', sort: (s) => s.scores.total, html: (s) => scoreBar(s.scores.total) },
  quality: { label: 'Chất lượng', sort: (s) => s.scores.quality, html: (s) => scoreBar(s.scores.quality) },
  growth: { label: 'Tăng trưởng', sort: (s) => s.scores.growth, html: (s) => scoreBar(s.scores.growth) },
  value: { label: 'Định giá', sort: (s) => s.scores.value, html: (s) => scoreBar(s.scores.value) },
  safety: { label: 'An toàn', sort: (s) => s.scores.safety, html: (s) => scoreBar(s.scores.safety) },
  divScore: { label: 'Cổ tức', sort: (s) => s.scores.dividend, html: (s) => scoreBar(s.scores.dividend) },
  er: {
    label: 'LN kỳ vọng 12T', cls: 'num', sort: (s) => s.er,
    html: (s) => `<b class="${dirCls(s.er)}">${fPct(s.er)}</b><div class="sub">giá ${fPct(s.upside, 0, true)} + CT ${fPct(s.divYield, 1)}</div>`,
  },
  target: { label: 'Giá mục tiêu', cls: 'num', sort: (s) => s.target, html: (s) => `<b>${fP(s.target)}</b><div class="sub">hợp lý ${fP(s.fair)}</div>` },
  buy: { label: 'Vùng mua', html: (s) => `<span class="zone buy">${fP(s.zones.buyLow)} – ${fP(s.zones.buyHigh)}</span>` },
  sell: { label: 'Vùng bán', html: (s) => `<span class="zone sell">${fP(s.zones.sellLow)} – ${fP(s.zones.sellHigh)}</span>` },
  stop: { label: 'Cắt lỗ', html: (s) => `<span class="zone stop">${fP(s.zones.stop)}</span>` },
  status: { label: 'Trạng thái', sort: (s) => ['buy', 'buyweak', 'wait', 'sell'].indexOf(s.zones.statusKey), html: (s) => statusBadge(s.zones) },
  div: { label: 'Cổ tức tiền mặt', cls: 'num', sort: (s) => s.div.lastYearDps, html: divCell },
  divDate: { label: 'Ngày GDKHQ / thanh toán', html: nextDiv },
  pe: { label: 'P/E', cls: 'num', sort: (s) => s.pe, html: (s) => fX(s.pe) },
  pb: { label: 'P/B', cls: 'num', sort: (s) => s.pb, html: (s) => fX(s.pb) },
  roe: { label: 'ROE', cls: 'num', sort: (s) => s.roe, html: (s) => fPct(s.roe) },
  sector: { label: 'Ngành', sort: (s) => s.sector, html: (s) => esc(s.sector) },
};

function renderTable(el, cols, rows, { extras = [], sortable = false, empty = 'Không có mã phù hợp.' } = {}) {
  const head = cols
    .map((k) => {
      const c = COL[k];
      const sortCls = sortable && c.sort ? ' sortable' : '';
      const arrowHtml = sortable && state.sort.key === k ? `<span class="arrow">${state.sort.dir < 0 ? '▼' : '▲'}</span>` : '';
      return `<th class="${c.cls || ''}${sortCls}" data-key="${k}" ${sortable && c.sort ? 'tabindex="0"' : ''}>${c.label}${arrowHtml}</th>`;
    })
    .join('');
  const body = rows.length
    ? rows
        .map((s, i) => `<tr data-code="${esc(s.code)}" tabindex="0">${cols
          .map((k) => {
            const c = COL[k];
            const lbl = k === 'code' || k === 'rank' ? '' : ` data-label="${esc(c.label)}"`;
            return `<td class="${c.cls || ''}"${lbl}>${c.html(s, i, extras[i])}</td>`;
          })
          .join('')}</tr>`)
        .join('')
    : `<tr><td class="empty" colspan="${cols.length}">${empty}</td></tr>`;
  el.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
}

// ---------- Các tab ----------
function renderKpis() {
  const d = state.data;
  const t20 = d.top20.map((c) => d.stocks[c]);
  const inBuy = t20.filter((s) => s.zones.statusKey === 'buy').length;
  const inBuyWeak = t20.filter((s) => s.zones.statusKey === 'buyweak').length;
  const strict = d.top10.filter((t) => t.tier === 'strict').length;
  const soon = d.calendar.filter((e) => e.exDate >= d.today && daysFrom(e.exDate) <= 30).length;
  $('#kpis').innerHTML = `
    <div class="kpi"><div class="label">Mã qua vòng lọc</div><div class="value">${d.universeCount}</div><div class="sub">trên ${d.hoseCount} mã HOSE · vốn hoá ≥ ${fP(d.config.minMarketCap / 1e9)} tỷ</div></div>
    <div class="kpi"><div class="label">Top 20 đang ở vùng mua</div><div class="value">${inBuy + inBuyWeak}/20</div><div class="sub">${inBuy} mã xu hướng tốt · ${inBuyWeak} mã xu hướng còn yếu</div></div>
    <div class="kpi"><div class="label">Top 10 đạt đủ tiêu chí</div><div class="value">${strict}/${d.top10.length}</div><div class="sub">${d.top10.length - strict} mã còn lại dùng tiêu chí nới lỏng</div></div>
    <div class="kpi"><div class="label">Sự kiện cổ tức sắp tới</div><div class="value">${d.calendar.length}</div><div class="sub">${soon} mã GDKHQ trong 30 ngày tới</div></div>`;
}
function daysFrom(iso) {
  return Math.round((Date.parse(iso) - Date.parse(state.data.today)) / 86400000);
}

function renderTop20() {
  const d = state.data;
  renderTable($('#t-top20'), ['rank', 'code', 'price', 'total', 'er', 'buy', 'sell', 'stop', 'status', 'div', 'divDate'], d.top20.map((c) => d.stocks[c]));
}
function renderTop10() {
  const d = state.data;
  const rows = d.top10.map((t) => d.stocks[t.code]);
  renderTable($('#t-top10'), ['rank', 'code', 'price', 'er', 'target', 'safety', 'buy', 'sell', 'stop', 'status', 'div', 'divDate'], rows, {
    extras: d.top10,
    empty: 'Hôm nay không có mã nào đạt tiêu chí. Thị trường có thể đang ở vùng định giá cao – hãy kiên nhẫn chờ.',
  });
  const strict = d.top10.filter((t) => t.tier === 'strict').length;
  const T = d.config.top10Tiers;
  $('#top10-note').innerHTML =
    `<b>Tiêu chí đầy đủ:</b> LN kỳ vọng ${fPct(T[0].erMin, 0)}–${fPct(T[0].erMax, 0)}, điểm an toàn ≥ ${T[0].safety}, chất lượng ≥ ${T[0].quality}, giá không thấp hơn MA200 quá 3%. ` +
    `Chỉ ${strict} mã đạt đủ; ${d.top10.length - strict} mã còn lại được bổ sung với <b>tiêu chí nới lỏng</b> (LN kỳ vọng ${fPct(T[1].erMin, 0)}–${fPct(T[1].erMax, 0)}, an toàn ≥ ${T[1].safety}, chất lượng ≥ ${T[1].quality}). ` +
    `Không mô hình nào đảm bảo được mức sinh lời 25–30%; hãy coi đây là danh sách để nghiên cứu thêm.`;
}
function renderCalendar() {
  const d = state.data;
  const kind = $('#cal-kind').value;
  const onlyU = $('#cal-universe').checked;
  const rows = d.calendar.filter((e) => {
    if (onlyU && !e.inUniverse) return false;
    if (kind === 'ex') return e.exDate >= d.today;
    if (kind === 'pay') return e.payDate && e.payDate >= d.today;
    if (kind === 'cash') return e.kind === 'cash';
    if (kind === 'stock') return e.kind === 'stock';
    return true;
  });
  // Sắp theo mốc sắp tới gần nhất: ngày GDKHQ nếu chưa qua, nếu đã qua thì ngày thanh toán
  const nextKey = (e) => (e.exDate >= d.today ? e.exDate : e.payDate || e.exDate);
  rows.sort((a, b) => nextKey(a).localeCompare(nextKey(b)) || a.code.localeCompare(b.code));
  const el = $('#t-calendar');
  if (!rows.length) { el.innerHTML = '<tbody><tr><td class="empty">Không có sự kiện phù hợp.</td></tr></tbody>'; return; }
  const when = (iso) => {
    if (!iso) return '—';
    const n = daysFrom(iso);
    const tail = n > 0 ? `còn ${n} ngày` : n === 0 ? 'hôm nay' : 'đã qua';
    return `${fDate(iso)}<div class="sub">${tail}</div>`;
  };
  el.innerHTML = `<thead><tr><th>Mã</th><th>Sự kiện</th><th>Ngày GDKHQ</th><th>Ngày thanh toán</th><th class="num">Mức chi trả</th><th class="num">Lợi suất</th><th class="num">Giá hiện tại</th></tr></thead><tbody>${rows
    .map((e) => `<tr data-code="${esc(e.code)}" ${e.inUniverse ? 'tabindex="0"' : 'style="cursor:default"'}>
      <td class="head"><span class="code">${esc(e.code)}</span>${e.inUniverse ? '' : '<span class="tag">ngoài bộ lọc</span>'}<div class="sub">${esc(e.name)}</div></td>
      <td data-label="Sự kiện">${esc(e.label)}<div class="sub">${esc(e.note)}</div></td>
      <td data-label="Ngày GDKHQ">${when(e.exDate)}</td>
      <td data-label="Ngày thanh toán">${when(e.payDate)}</td>
      <td class="num" data-label="Mức chi trả"><b>${e.kind === 'cash' ? fP(e.dps) + ' đ/cp' : fX(e.ratio) + '%'}</b>${e.kind === 'cash' && isNum(e.ratio) ? `<div class="sub">${fX(e.ratio)}% mệnh giá</div>` : ''}</td>
      <td class="num" data-label="Lợi suất">${e.kind === 'cash' ? fPct(e.yield) : '—'}</td>
      <td class="num" data-label="Giá hiện tại">${fP(e.price)}</td></tr>`)
    .join('')}</tbody>`;
}
function renderAll() {
  const q = $('#all-search').value.trim().toLowerCase();
  const sec = $('#all-sector').value;
  const st = $('#all-status').value;
  const { key, dir } = state.sort;
  const getter = COL[key]?.sort || ((s) => s.scores.total);
  const rows = state.list
    .filter((s) => (!q || s.code.toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q) || (s.company || '').toLowerCase().includes(q)) &&
      (!sec || s.sector === sec) && (!st || s.zones.statusKey === st))
    .sort((a, b) => {
      const x = getter(a), y = getter(b);
      if (typeof x === 'string') return dir * x.localeCompare(y, 'vi');
      return dir * ((isNum(x) ? x : -Infinity) - (isNum(y) ? y : -Infinity));
    });
  renderTable($('#t-all'), ['rank', 'code', 'price', 'total', 'quality', 'growth', 'value', 'safety', 'divScore', 'er', 'pe', 'roe', 'status'], rows, { sortable: true });
  $('#all-desc').textContent = `${rows.length} mã · bấm tiêu đề cột để sắp xếp, bấm dòng để xem chi tiết.`;
}

function renderMethod() {
  const c = state.data.config;
  const w = c.weights;
  $('#method').innerHTML = `
  <h3>1. Vòng lọc ban đầu</h3>
  <p>Lấy toàn bộ cổ phiếu niêm yết trên HOSE, giữ lại mã có vốn hoá ≥ <b>${fP(c.minMarketCap / 1e9)} tỷ đồng</b>, giá trị giao dịch bình quân 10 phiên ≥ <b>${fP(c.minLiquidity / 1e9)} tỷ đồng/phiên</b>, EPS 4 quý gần nhất dương, P/E từ 0 đến 60 và vốn chủ sở hữu dương.</p>
  <h3>2. Năm nhóm điểm (0–100, xếp hạng phân vị trong nhóm mã đã lọc)</h3>
  <ul>
    <li><b>Chất lượng (${w.quality * 100}%)</b>: ROE bình quân 5 quý (50%), ROA (20%), độ ổn định EPS 3 năm (30%); trừ điểm nếu có quý EPS âm.</li>
    <li><b>Tăng trưởng (${w.growth * 100}%)</b>: tăng trưởng EPS 4 quý so với cùng kỳ và CAGR EPS 3 năm. EPS tăng đột biến &gt;100% bị giới hạn điểm vì có thể đến từ khoản lợi nhuận bất thường.</li>
    <li><b>Định giá (${w.value * 100}%)</b>: mức chiết khấu của giá so với giá trị hợp lý (60%) và chỉ số PEG (40%).</li>
    <li><b>An toàn (${w.safety * 100}%)</b>: beta (20%), độ biến động giá năm (25%), mức sụt giảm tối đa trong 1 năm (15%), vốn hoá (15%), thanh khoản (10%), xu hướng so với MA200 (15%).</li>
    <li><b>Cổ tức (${w.dividend * 100}%)</b>: lợi suất cổ tức tiền mặt (60%) và số năm trả cổ tức tiền mặt trong 3 năm gần nhất (40%).</li>
  </ul>
  <p><b>Top 20</b> = 20 mã có điểm tổng cao nhất, loại mã có ROE &lt; 8% hoặc EPS giảm &gt;25%, tối đa ${c.maxPerSector.top20} mã mỗi ngành.</p>
  <h3>3. Giá trị hợp lý và giá mục tiêu 12 tháng</h3>
  <ul>
    <li>Doanh nghiệp thường: <code>Giá trị hợp lý = P/E hợp lý × EPS 4 quý</code>. Ngân hàng, chứng khoán, bảo hiểm: <code>P/B hợp lý × BVPS</code>. Bất động sản: trung bình hai cách.</li>
    <li>P/E (P/B) hợp lý = P/E hiện tại + ½ × (mức neo − P/E hiện tại), với mức neo = 60% trung vị 3 năm của chính mã + 40% trung vị ngành. Nghĩa là chỉ giả định định giá hồi phục một nửa.</li>
    <li>Giá mục tiêu mô hình = giá trị hợp lý × (1 + tăng trưởng EPS ước tính, giới hạn −15% đến +20%). Với nhóm tài chính dùng tốc độ tăng BVPS ≈ ROE − cổ tức.</li>
    <li>Nếu có giá mục tiêu của các công ty chứng khoán trong 6 tháng qua, giá mục tiêu cuối = ${(1 - c.analystWeight) * 100}% mô hình + ${c.analystWeight * 100}% trung vị CTCK (50/50 nếu có từ 2 CTCK). Tiềm năng tăng giá bị chặn ở mức +${c.maxUpside * 100}%.</li>
    <li><b>Lợi nhuận kỳ vọng 12 tháng</b> = tiềm năng tăng giá + lợi suất cổ tức bền vững (mức thấp hơn giữa 12 tháng gần nhất và trung bình 3 năm, tối đa 10%, để cổ tức đặc biệt một lần không làm đẹp số liệu).</li>
  </ul>
  <h3>4. Top 10 tiềm năng 25–30%/năm, an toàn cao</h3>
  <p>Ưu tiên mã có LN kỳ vọng ${fPct(c.top10Tiers[0].erMin, 0)}–${fPct(c.top10Tiers[0].erMax, 0)} (vẫn nhận mức trên 30% vì mô hình luôn có sai số), điểm an toàn ≥ ${c.top10Tiers[0].safety}, chất lượng ≥ ${c.top10Tiers[0].quality}, giá không nằm dưới MA200 quá 3%, không có EPS tăng đột biến. Xếp theo trung bình của điểm an toàn và điểm tổng; tối đa ${c.maxPerSector.top10} mã mỗi ngành. Nếu chưa đủ 10 mã, bổ sung bằng tiêu chí nới lỏng và gắn nhãn rõ ràng.</p>
  <h3>5. Vùng mua, vùng bán, cắt lỗ</h3>
  <ul>
    <li><b>Cận trên vùng mua</b> = mức giá cao nhất mà nếu mua ở đó vẫn có LN kỳ vọng ≥ ${fPct(c.minReturn, 0)} (gồm cổ tức) và không vượt giá trị hợp lý. Nếu giá hiện tại đã thấp hơn mức này, vùng mua được đặt quanh giá hiện tại, cận dưới là vùng hỗ trợ (đáy 60 phiên).</li>
    <li><b>Vùng bán (chốt lời)</b> = giá mục tiêu ± 5%.</li>
    <li><b>Cắt lỗ</b> = thấp hơn cận dưới vùng mua khoảng 7% hoặc 2 lần ATR(14), tối đa 15%.</li>
    <li>"Vùng mua – xu hướng còn yếu": giá đang rẻ nhưng nằm dưới MA200 hơn 5%; nên chia nhỏ lệnh và chờ tín hiệu hồi phục.</li>
    <li>Giá làm tròn theo bước giá HOSE (10đ / 50đ / 100đ).</li>
  </ul>
  <h3>6. Cổ tức</h3>
  <p>Lấy từ lịch sự kiện quyền: cổ tức tiền mặt (đ/cp), cổ tức bằng cổ phiếu và cổ phiếu thưởng, kèm <b>ngày GDKHQ</b> (phải mua trước ngày này để được hưởng) và <b>ngày thanh toán</b>. "Cổ tức tiền mặt năm X" = tổng tiền mặt có ngày GDKHQ trong năm X.</p>
  <h3>7. Nguồn và cập nhật</h3>
  <p>Dữ liệu từ VNDirect Finfo API công khai. Trang tự chạy lại sau mỗi phiên (khoảng 15h45 các ngày làm việc) bằng GitHub Actions. Nút <b>Cập nhật trực tiếp</b> chạy cùng công thức ngay trong trình duyệt của bạn.</p>
  <h3>8. Giới hạn cần biết</h3>
  <ul>
    <li>Mô hình dựa trên số liệu quá khứ; không lường trước được tin tức, thay đổi chính sách hay biến động vĩ mô.</li>
    <li>EPS và cổ tức có thể chưa điều chỉnh đầy đủ theo phát hành thêm / chia cổ phiếu thưởng.</li>
    <li>Số liệu nguồn có thể chậm hoặc sai; luôn đối chiếu với báo cáo tài chính và công bố thông tin chính thức của doanh nghiệp.</li>
    <li>Đây không phải lời khuyên đầu tư cá nhân. Người lập trang không phải nhà tư vấn đầu tư được cấp phép.</li>
  </ul>`;
}

// ---------- Biểu đồ giá ----------
const chartGeom = new WeakMap();
function niceTicks(lo, hi, n = 4) {
  const raw = (hi - lo) / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}
function priceChart(s) {
  const pts = s.spark || [];
  if (pts.length < 2) return '<p class="sub">Chưa đủ dữ liệu giá.</p>';
  const z = s.zones;
  const narrow = innerWidth < 600;
  const W = narrow ? 380 : 640, H = narrow ? 230 : 250, m = { l: 48, r: 62, t: 12, b: 26 };
  const vals = pts.map((p) => p[1] * 1000);
  let lo = Math.min(...vals, z.stop), hi = Math.max(...vals, z.sellHigh);
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const x = (i) => m.l + (i * (W - m.l - m.r)) / (pts.length - 1);
  const y = (v) => m.t + ((hi - v) * (H - m.t - m.b)) / (hi - lo);
  const grid = niceTicks(lo, hi).map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fP(v)}</text>`).join('');
  const months = [];
  for (let i = 1; i < pts.length; i++) if (pts[i][0].slice(5, 7) !== pts[i - 1][0].slice(5, 7)) months.push(i);
  const every = narrow ? 3 : 2;
  const xl = months.filter((_, k) => k % every === 0).map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">T${+pts[i][0].slice(5, 7)}/${pts[i][0].slice(2, 4)}</text>`).join('');
  const band = (a, b, fill, label) => {
    const y1 = y(b), y2 = y(a);
    return `<rect x="${m.l}" y="${y1}" width="${W - m.l - m.r}" height="${Math.max(2, y2 - y1)}" fill="${fill}"/><text x="${W - m.r + 6}" y="${(y1 + y2) / 2 + 4}" font-size="11" fill="var(--ink-2)">${label}</text>`;
  };
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1] * 1000).toFixed(1)}`).join('');
  chartGeom.set(s, { W, H, xs: pts.map((_, i) => x(i)), ys: vals.map(y) });
  const lx = x(pts.length - 1), ly = y(vals[vals.length - 1]);
  return `<div class="chart" data-chart>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ giá 1 năm của ${esc(s.code)} cùng vùng mua, vùng bán và ngưỡng cắt lỗ">
      ${grid}
      ${band(z.buyLow, z.buyHigh, 'var(--buy-band)', 'Vùng mua')}
      ${band(z.sellLow, z.sellHigh, 'var(--sell-band)', 'Vùng bán')}
      <line x1="${m.l}" x2="${W - m.r}" y1="${y(z.stop)}" y2="${y(z.stop)}" stroke="var(--critical)" stroke-width="1.5" stroke-dasharray="5 4"/>
      <text x="${W - m.r + 6}" y="${y(z.stop) + 4}" font-size="11" fill="var(--ink-2)">Cắt lỗ</text>
      <line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="var(--axis)"/>
      ${xl}
      <path d="${path}" fill="none" stroke="var(--line)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${lx}" cy="${ly}" r="4.5" fill="var(--line)" stroke="var(--surface)" stroke-width="2"/>
      <g class="hover" style="display:none"><line y1="${m.t}" y2="${H - m.b}" stroke="var(--axis)"/><circle r="4.5" fill="var(--line)" stroke="var(--surface)" stroke-width="2"/></g>
      <rect class="hit" x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent"/>
    </svg>
    <div class="tip"></div>
    <div class="legend"><span><i style="background:var(--line);height:3px"></i>Giá đóng cửa (đã điều chỉnh)</span><span><i style="background:var(--buy-band);outline:1px solid var(--good)"></i>Vùng mua</span><span><i style="background:var(--sell-band);outline:1px solid var(--sell)"></i>Vùng bán</span><span><i style="background:none;border-top:2px dashed var(--critical);height:0"></i>Cắt lỗ</span></div>
  </div>`;
}
function bindChart(root, s) {
  const box = root.querySelector('[data-chart]');
  const geo = chartGeom.get(s);
  if (!box || !geo) return;
  const svg = box.querySelector('svg'), hit = box.querySelector('.hit'), g = box.querySelector('.hover'), tip = box.querySelector('.tip');
  const pts = s.spark;
  const [line, dot] = g.children;
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * geo.W;
    let i = 0;
    for (let k = 1; k < geo.xs.length; k++) if (Math.abs(geo.xs[k] - sx) < Math.abs(geo.xs[i] - sx)) i = k;
    const cx = geo.xs[i], cy = geo.ys[i];
    line.setAttribute('x1', cx); line.setAttribute('x2', cx);
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
    g.style.display = '';
    tip.style.opacity = 1;
    tip.style.left = `${(cx / geo.W) * r.width}px`;
    tip.style.top = `${(cy / geo.H) * r.height}px`;
    tip.textContent = `${fDate(pts[i][0])}: ${fP(pts[i][1] * 1000)} đ`;
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => { g.style.display = 'none'; tip.style.opacity = 0; });
}

// ---------- Chi tiết mã ----------
function openDetail(code) {
  const s = state.data.stocks[code];
  if (!s) return;
  const z = s.zones;
  const t10 = state.data.top10.find((t) => t.code === code);
  const r20 = state.data.top20.indexOf(code);
  const y = +state.data.today.slice(0, 4);
  const erAtBuy = isNum(z.buyHigh) ? s.target / z.buyHigh - 1 + (s.divYield || 0) : null;
  const riskAtBuy = isNum(z.buyHigh) ? z.stop / z.buyHigh - 1 : null;
  const rr = isNum(erAtBuy) && riskAtBuy < 0 ? erAtBuy / -riskAtBuy : null;
  const years = Object.keys(s.div.byYear).sort().reverse();
  const sc = s.scores;
  const metric = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  const dlg = $('#detail');
  dlg.innerHTML = `
  <div class="d-head">
    <div>
      <h3 id="d-title">${esc(s.code)} ${s.vn30 ? '<span class="tag">VN30</span>' : ''} ${r20 >= 0 ? `<span class="tag">Top 20 · #${r20 + 1}</span>` : ''} ${t10 ? tierBadge(t10.tier) : ''}</h3>
      <div class="sub">${esc(s.company)} · ${esc(s.sector)}</div>
      <div style="margin-top:6px">${statusBadge(z)}</div>
    </div>
    <div class="price">${fP(s.price)} đ<span class="sub ${dirCls(s.change)}">${arrow(s.change)}${fPct(s.change, 2, true)} · phiên ${fDate(state.data.tradingDate)}</span></div>
    <button class="btn icon close" id="d-close" aria-label="Đóng">✕</button>
  </div>
  <div class="d-body">
    <div class="card span2">
      <h4>Giá 1 năm và vùng giao dịch tham khảo</h4>
      ${priceChart(s)}
    </div>
    <div class="card">
      <h4>Kế hoạch giao dịch tham khảo</h4>
      <div class="metrics">
        ${metric('Vùng mua', `<span class="zone buy">${fP(z.buyLow)} – ${fP(z.buyHigh)}</span>`)}
        ${metric('Vùng bán (chốt lời)', `<span class="zone sell">${fP(z.sellLow)} – ${fP(z.sellHigh)}</span>`)}
        ${metric('Ngưỡng cắt lỗ', `<span class="zone stop">${fP(z.stop)}</span>`)}
        ${metric('Giá mục tiêu 12 tháng', fP(s.target))}
        ${metric('LN kỳ vọng tại giá hiện tại', fPct(s.er))}
        ${metric('LN kỳ vọng nếu mua ở cận trên vùng mua', fPct(erAtBuy))}
        ${metric('Rủi ro nếu chạm cắt lỗ', fPct(riskAtBuy))}
        ${metric('Tỷ lệ lợi nhuận / rủi ro', isNum(rr) ? nf2.format(rr) + ' lần' : '—')}
      </div>
      <p class="hint">Chia nhỏ lệnh mua trong vùng mua; tuân thủ cắt lỗ. Đây là mức tham khảo do công thức tính, không phải khuyến nghị.</p>
    </div>
    <div class="card">
      <h4>Điểm đánh giá</h4>
      <div class="scorebars">
        ${[['Chất lượng', sc.quality], ['Tăng trưởng', sc.growth], ['Định giá', sc.value], ['An toàn', sc.safety], ['Cổ tức', sc.dividend], ['Tổng hợp', sc.total]]
          .map(([k, v], i) => `<div class="row ${i === 5 ? 'total' : ''}"><span>${k}</span><span class="track"><span class="fill" style="width:${v}%"></span></span><span class="num">${Math.round(v)}</span></div>`).join('')}
      </div>
      <h4 style="margin-top:14px">Điểm cần lưu ý</h4>
      ${s.flags.length ? `<ul class="flags">${s.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p class="sub" style="margin:0">Không có cảnh báo lớn từ bộ lọc.</p>'}
    </div>
    <div class="card">
      <h4>Định giá</h4>
      <div class="metrics">
        ${metric('Phương pháp', s.method)}
        ${metric('P/E hiện tại · trung vị 3 năm', `${fX(s.pe)} · ${fX(s.peMed)}`)}
        ${metric('P/B hiện tại · trung vị 3 năm', `${fX(s.pb)} · ${fX(s.pbMed)}`)}
        ${metric('P/E · P/B hợp lý dùng tính', `${fX(s.fairPE)} · ${fX(s.fairPB)}`)}
        ${metric('Giá trị hợp lý hiện tại', fP(s.fair))}
        ${metric('Tăng trưởng EPS ước tính', fPct(s.gEst))}
        ${metric('Giá mục tiêu theo mô hình', fP(s.modelTarget))}
        ${metric('Giá mục tiêu CTCK (trung vị)', s.analyst ? `${fP(s.analyst.target)} <span class="sub">(${s.analyst.count} CTCK)</span>` : 'Không có')}
        ${metric('Giá mục tiêu cuối', `<b>${fP(s.target)}</b> (${fPct(s.upside, 1, true)})`)}
      </div>
      ${s.analyst ? `<p class="hint">CTCK: ${s.analyst.firms.map((f) => `${esc(f.firm)} ${esc(f.type)} ${fP(f.target)} (${fDate(f.date)})`).join(' · ')}</p>` : ''}
    </div>
    <div class="card">
      <h4>Chỉ số chính</h4>
      <div class="metrics">
        ${metric('Vốn hoá', fBn(s.mcap))}
        ${metric('GTGD TB 10 phiên', fBn(s.liq))}
        ${metric('EPS 4 quý', fP(s.eps) + ' đ')}
        ${metric('BVPS', fP(s.bvps) + ' đ')}
        ${metric('ROE · ROA', `${fPct(s.roe)} · ${fPct(s.roa)}`)}
        ${metric('EPS so với cùng kỳ', fPct(s.g1, 1, true))}
        ${metric('CAGR EPS 3 năm', fPct(s.cagr3, 1, true))}
        ${metric('Beta', fX(s.beta))}
        ${metric('Biến động giá năm', fPct(s.vol))}
        ${metric('Sụt giảm tối đa 1 năm', fPct(-s.maxDD))}
        ${metric('MA20 · MA50 · MA200', `${fP(s.ma20)} · ${fP(s.ma50)} · ${fP(s.ma200)}`)}
        ${metric('Hiệu suất 1T · 3T · 1N', `${fPct(s.perf1m, 1, true)} · ${fPct(s.perf3m, 1, true)} · ${fPct(s.perf1y, 1, true)}`)}
        ${metric('Sở hữu nước ngoài', fPct(s.foreign))}
      </div>
    </div>
    <div class="card span2">
      <h4>Cổ tức</h4>
      <div class="metrics" style="margin-bottom:10px">
        ${metric(`Tiền mặt năm ${y - 1}`, fP(s.div.lastYearDps) + ' đ/cp')}
        ${metric('12 tháng gần nhất', `${fP(s.div.ttm)} đ/cp (${fPct(s.div.yieldTTM)})`)}
        ${metric('Lợi suất dùng tính LN kỳ vọng', fPct(s.divYield))}
        ${metric('Số năm trả tiền mặt (3 năm gần nhất)', `${s.div.yearsPaid}/3`)}
      </div>
      ${years.length ? `<table class="mini"><thead><tr><th>Năm (theo ngày GDKHQ)</th>${years.map((k) => `<th class="num">${k}</th>`).join('')}</tr></thead><tbody><tr><td>Cổ tức tiền mặt (đ/cp)</td>${years.map((k) => `<td class="num">${fP(s.div.byYear[k])}</td>`).join('')}</tr></tbody></table>` : ''}
      ${s.div.history.length ? `<table class="mini" style="margin-top:10px"><thead><tr><th>Ngày GDKHQ</th><th>Ngày thanh toán</th><th>Loại</th><th>Nội dung</th><th class="num">Mức</th></tr></thead><tbody>${s.div.history
        .map((h) => `<tr${h.exDate >= state.data.today || (h.payDate && h.payDate >= state.data.today) ? ' style="font-weight:600"' : ''}><td>${fDate(h.exDate)}</td><td>${fDate(h.payDate)}</td><td>${h.kind === 'cash' ? 'Tiền mặt' : esc(h.label)}</td><td>${esc(h.note)}</td><td class="num">${h.kind === 'cash' ? fP(h.dps) + ' đ' : fX(h.ratio) + '%'}</td></tr>`).join('')}</tbody></table><p class="hint">Dòng in đậm: sự kiện sắp diễn ra / chưa thanh toán.</p>` : '<p class="sub">Không có lịch sử cổ tức trong 4 năm gần nhất.</p>'}
    </div>
  </div>`;
  $('#d-close').onclick = () => dlg.close();
  dlg.onclick = (e) => { if (e.target === dlg) dlg.close(); };
  bindChart(dlg, s);
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}

// ---------- Điều khiển ----------
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.id !== `tab-${tab}`));
  if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
}
function progress(msg) { $('#progress').textContent = msg || ''; }

function setData(d) {
  state.data = d;
  state.list = Object.values(d.stocks);
  const gen = new Date(d.generatedAt);
  $('#meta').innerHTML = `Phiên <b>${fDate(d.tradingDate)}</b> · tính lúc ${gen.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`;
  const secs = [...new Set(state.list.map((s) => s.sector))].sort((a, b) => a.localeCompare(b, 'vi'));
  const sel = $('#all-sector');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Tất cả ngành</option>' + secs.map((x) => `<option${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join('');
  renderKpis(); renderTop20(); renderTop10(); renderCalendar(); renderAll(); renderMethod();
  const age = Math.round((Date.parse(vnToday()) - Date.parse(d.tradingDate)) / 86400000);
  if (age > 4) progress(`Dữ liệu là của phiên ${fDate(d.tradingDate)} (${age} ngày trước). Bấm "Cập nhật trực tiếp" để lấy số liệu mới nhất.`);
}

async function refresh() {
  const btn = $('#refreshBtn');
  btn.disabled = true;
  const get = async (url, tries = 3) => {
    for (let i = 1; ; i++) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) {
        if (i >= tries) throw e;
        await new Promise((res) => setTimeout(res, 1200 * i));
      }
    }
  };
  try {
    const t0 = Date.now();
    const d = await buildDataset({ get, log: (m) => progress(`⟳ ${m} (${Math.round((Date.now() - t0) / 1000)} giây)`) });
    store(CACHE_KEY, JSON.stringify(d));
    setData(d);
    progress(`✓ Đã cập nhật dữ liệu phiên ${fDate(d.tradingDate)}.`);
    setTimeout(() => progress(''), 8000);
  } catch (e) {
    progress(`Không cập nhật được (${e.message}). Đang hiển thị dữ liệu đã lưu.`);
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  const h = location.hash.slice(1);
  if (['top20', 'top10', 'calendar', 'all', 'method'].includes(h)) setTab(h);

  document.addEventListener('click', (e) => {
    const th = e.target.closest('#t-all th.sortable');
    if (th) {
      const k = th.dataset.key;
      state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: COL[k].sort && typeof COL[k].sort(state.list[0]) === 'string' ? 1 : -1 };
      renderAll();
      return;
    }
    const tr = e.target.closest('tbody tr[data-code]');
    if (tr && state.data?.stocks[tr.dataset.code]) openDetail(tr.dataset.code);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const tr = e.target.closest?.('tbody tr[data-code]');
    if (tr && state.data?.stocks[tr.dataset.code]) openDetail(tr.dataset.code);
    const th = e.target.closest?.('#t-all th.sortable');
    if (th) th.click();
  });
  ['#all-search', '#all-sector', '#all-status'].forEach((s) => $(s).addEventListener('input', () => state.data && renderAll()));
  ['#cal-kind', '#cal-universe'].forEach((s) => $(s).addEventListener('change', () => state.data && renderCalendar()));
  $('#refreshBtn').addEventListener('click', refresh);
  $('#themeBtn').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store('theme', root.dataset.theme);
  });

  let data = null;
  try {
    const r = await fetch('data/stocks.json', { cache: 'no-cache' });
    if (r.ok) data = await r.json();
  } catch (e) { /* bỏ qua */ }
  try {
    const cached = JSON.parse(load(CACHE_KEY) || 'null');
    if (cached?.generatedAt && (!data || cached.generatedAt > data.generatedAt)) data = cached;
  } catch (e) { /* bỏ qua */ }
  if (data) setData(data);
  else {
    $('#meta').textContent = 'Chưa có dữ liệu';
    progress('Chưa có file dữ liệu. Đang lấy dữ liệu trực tiếp…');
    refresh();
  }
}

init();
