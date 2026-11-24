# Báo cáo backtest — Lọc Cổ Phiếu HOSE

Ngày lập: 24/11/2026 · Dữ liệu giá đến phiên 23/11/2026

> Đây là đánh giá kỹ thuật của một bộ công thức, không phải lời khuyên đầu tư. Kết quả quá khứ không bảo đảm kết quả tương lai.

## 0. Cập nhật sau rà soát độc lập (24/11/2026) — đọc mục này trước

Một mô hình khác (Opus) đã rà soát độc lập mã và kết luận của báo cáo này. Tóm tắt:

**Đứng vững:** không phát hiện lỗi nhìn trước tương lai đáng kể (dữ liệu P/E, BVPS, giá điều chỉnh, độ trễ EPS 45 ngày đều hợp lý); mã tính lợi suất và giao dịch giả lập đúng; các số chính tái lập chính xác. Cũng đứng vững: điểm "tiềm năng ước tính" có khả năng xếp hạng (chủ yếu do yếu tố định giá), cắt lỗ mặc định quá sát, mã "vùng chốt lời" kém mặt bằng.

**Phải sửa so với các phần bên dưới:**
1. **Giai đoạn "kiểm tra" không xác nhận được trọng số mới.** Trọng số được chọn sau khi xem toàn bộ dữ liệu. Chỉ dùng giai đoạn học thì Chất lượng (IC 0,18) và Cổ tức (0,11) tốt hơn Định giá (0,10), tức sẽ chọn ngược lại. Giai đoạn kiểm tra chỉ có 16 tín hiệu có kết quả 12 tháng (không phải 29), và cửa sổ lợi suất của hai giai đoạn chồng lấn 12 tháng. **Trọng số mới là giả thuyết chưa được kiểm chứng.**
2. **Các bộ lọc đơn giản hơn mô hình rất nhiều** (cùng dữ liệu, lợi suất 12 tháng hơn mặt bằng, điểm %):

| Cách chọn 20 mã | Hơn mặt bằng 12T | % tháng hơn mặt bằng | Sai số Newey-West |
|---|---|---|---|
| P/E thấp nhất | +12,1 | 97% | ±2,3 |
| Vốn hoá lớn nhất | +11,8 | 81% | ±7,4 |
| Điểm Định giá cao nhất | +11,5 | 75% | ±6,3 |
| Tiềm năng ước tính cao nhất (không áp bộ lọc chất lượng/giới hạn ngành) | +11,8 | 72% | ±6,1 |
| **Top 20 trọng số mới** | **+5,2** | 72% | ±1,6 (*) |
| **Top 20 trọng số gốc** | **+1,5** | 56% | ±1,9 (*) |
| Chọn ngẫu nhiên 20 mã (1000 lần, khoảng 95%) | −3,0 đến +3,2 | — | — |

(*) Sai số Newey-West với chỉ 32 tín hiệu chồng lấn không đáng tin; sai số theo số quan sát độc lập khoảng ±6. Top 20 gốc nằm trong dải của chọn ngẫu nhiên; Top 20 mới nằm trên dải nhưng thấp hơn xa các bộ lọc đơn giản.
   Chưa có bằng chứng rằng điểm tổng hợp phức tạp tốt hơn một bộ lọc P/E hoặc vốn hoá đơn giản (giai đoạn 2023–2026 là giai đoạn định giá thấp và vốn hoá lớn đều thắng, có thể không lặp lại).

   **Kiểm tra bổ sung (đã làm sau khi có nhận định trên):** thử bỏ từng bộ lọc của Top 20 xem chúng có phải nguyên nhân không. Kết quả là **không**:

| Phương án Top 20 (trọng số mới) | Hơn mặt bằng 12T | Giai đoạn học | Giai đoạn kiểm tra | Thua tệ nhất |
|---|---|---|---|---|
| Hiện tại (đủ bộ lọc) | +5,2 | +5,0 | +5,5 | −10,7 |
| Bỏ giới hạn 5 mã/ngành | +5,1 | +4,1 | +6,0 | −12,6 |
| Bỏ ngưỡng điểm chất lượng | +4,1 | +4,4 | +3,7 | −10,9 |
| Bỏ hết bộ lọc (kể cả loại ROE thấp/EPS giảm) | +3,1 | +3,6 | +2,6 | −16,0 |
| Bỏ hết bộ lọc và xếp theo tiềm năng ước tính | +12,0 | +3,4 | **+20,5** | −16,0 |
| Gốc (trọng số cũ, đủ bộ lọc) | +1,5 | +3,3 | −0,3 | −15,3 |

   Bỏ bộ lọc không cải thiện (còn giảm nhẹ). Phần "mất tín hiệu" nằm ở **cách xếp hạng bằng điểm tổng hợp** (nhất là trọng số An toàn 30% và Chất lượng), không phải ở bộ lọc. Xếp thẳng theo tiềm năng ước tính cho +12,0 điểm %, nhưng gần như toàn bộ đến từ giai đoạn sau 07/2024 (+3,4 ở giai đoạn học so với +20,5 ở giai đoạn kiểm tra), nên không đáng tin hơn các phương án khác. Ngược lại, bộ lọc P/E thấp ổn định hơn qua hai giai đoạn (khoảng +11 và +13 theo Opus). Đây là kiểm tra thăm dò, thêm vào nhiều lần thử trước đó nên cũng chịu cùng cảnh báo về chọn lọc kết quả.
3. **Đã thử khoảng 10 cấu hình rồi chọn cấu hình tốt nhất**, nên chênh lệch +3,7 điểm % giữa trọng số mới và cũ chưa đủ chắc chắn.
4. **Trần +35% làm kết quả giao dịch giả lập kém đi:** lợi suất mỗi lệnh theo quy tắc web 7,6% → 6,5%; không cắt lỗ 14,4% → 12,5%. Ngoài ra 18/20 mã Top 20 chạm đúng trần nên cột "Tiềm năng ước tính" không còn phân biệt được các mã đầu bảng. Trần chỉ cải thiện việc số hiển thị gần thực tế hơn.
5. **Danh sách mã thiếu một số mã đã hủy niêm yết** (FLC, HAI, AMD, TGG...), do nguồn chỉ liệt kê mã đang ở HOSE hôm nay; ảnh hưởng ước tính nhỏ vì phần lớn không qua bộ lọc vốn hoá. **Khuyến nghị CTCK trong quá khứ rất thưa** (khoảng 15 báo cáo/tháng so với 134 trong 10–11/2026), nên giá mục tiêu và vùng mua lịch sử lệch so với hiện tại.

**Trạng thái hiện tại:** trọng số mới và trần 35% đang chạy trên web nhưng được gắn nhãn "chưa kiểm chứng". Cách đánh giá đúng là dữ liệu thật tích lũy từ 24/11/2026 (đã bật bản chụp hằng ngày), so với bộ lọc P/E thấp và chọn ngẫu nhiên 20 mã.

## 1. Tóm tắt

1. **Điểm "LN kỳ vọng" có khả năng xếp hạng, nhưng con số tuyệt đối bị thổi phồng.** Chia các mã thành 5 nhóm theo "LN kỳ vọng", nhóm cao nhất cho lợi suất thật 12 tháng +27,1%, nhóm thấp nhất +9,3% (chênh +17,8 điểm %). Nhóm cao nhất được dự báo +38%, nhóm thấp nhất được dự báo −20%, nhưng thực tế không mã nào "đúng như dự báo". Nên dùng như thứ hạng, không dùng như lời hứa lợi nhuận.
2. **Top 20 chưa chứng minh được là hơn mặt bằng.** Trung bình hơn toàn bộ mã đạt bộ lọc +1,5 điểm % sau 12 tháng, sai số ±6,3, nên không phân biệt được với 0. Theo năm: +2,6 / −3,2 / +5,8 điểm % (2023 / 2024 / 2025).
3. **Tín hiệu bán có tác dụng đúng hướng.** Mã đang "vùng chốt lời" kém mặt bằng −4,2 điểm % sau 12 tháng, và chỉ vượt mặt bằng trong 16% số tháng. Mã có LN kỳ vọng dưới 10% kém −3,9 điểm %.
4. **Cắt lỗ mặc định quá sát.** 42% lệnh bị cắt lỗ trong khoảng 91 ngày. Lệnh mua theo vùng mua và thoát theo quy tắc của web cho +7,6%/lệnh sau phí, thấp hơn nhiều so với cầm cùng các mã 12 tháng (+27,7%) và so với toàn bộ mã đạt lọc (+15,4%). Bỏ cắt lỗ nâng kết quả lên +14,4%/lệnh, nhưng khi đó có lệnh lỗ trung bình −18,2% và 36% lệnh còn đang giữ sau 12 tháng. Giai đoạn kiểm tra là thị trường tăng, nên chưa thể kết luận bỏ cắt lỗ là tốt.
5. **Hiện tại bất thường:** 61% số mã đạt lọc đang ở vùng mua (19/20 trong Top 20). Trong 45 tín hiệu quá khứ, mức cao nhất chỉ 42%. Không có tiền lệ để so sánh.

## 2. Cách làm

- Chạy **nguyên bộ máy `assets/engine.js`** (không viết lại công thức) tại 45 ngày cuối tháng, từ 31/03/2023 đến 23/11/2026, với dữ liệu như thể hôm đó là "hôm nay".
- Kiểm tra độ trung thực: chạy lại ngày 23/11/2026 cho ra 101 mã (đúng bằng web thật), Top 20 trùng 19/20 mã, vùng mua gần như y hệt.
- Lợi suất tương lai: mua ở giá đóng cửa phiên **sau** ngày tín hiệu, giữ 3, 6, 12 tháng, đã điều chỉnh cổ tức và chia thưởng cổ phiếu, trừ phí khứ hồi 0,6%.
- Mốc so sánh: trung bình toàn bộ mã đạt bộ lọc cùng ngày (không có chuỗi VN-Index trong nguồn dữ liệu).
- Số tín hiệu đã có kết quả: 41 (3 tháng), 38 (6 tháng), 32 (12 tháng). Do các cửa sổ chồng lấn, số quan sát độc lập chỉ khoảng **13,7 / 6,3 / 2,7**. Đây là lý do sai số còn lớn.

### Chống nhìn trước tương lai
- Chỉ dùng dữ liệu có ngày không muộn hơn ngày tín hiệu.
- EPS, ROE, ROA theo quý chỉ được dùng sau 45 ngày kể từ cuối quý (thử lại với 90 ngày, kết quả gần như không đổi).
- P/E, P/B tính lại từ giá và EPS, BVPS đã công bố.
- Có cả mã sau này bị hủy niêm yết (giảm thiên lệch người sống sót), dù 25 mã thiếu chuỗi giá nên bị bỏ.

## 3. Kết quả chính (lợi suất sau phí, so với mặt bằng)

| Nhóm | 3 tháng | 6 tháng | 12 tháng | Tỷ lệ số tháng hơn mặt bằng (12T) |
|---|---|---|---|---|
| Toàn bộ mã đạt lọc (mốc) | +3,0% | +6,0% | +15,4% | — |
| Top 20 | +0,3 | +0,7 | +1,5 (±6,3) | 56% |
| Mã nổi bật (Top 10, ~6 mã) | +0,9 | +0,6 | +4,8 (±8,3) | 66% |
| Top 20 đang ở vùng mua | −0,5 | −0,4 | +1,8 (±7,4) | 52% |
| Vùng mua – xu hướng tốt | +1,9 | +3,7 | +9,6 (±11,5) | 66% |
| Vùng mua – xu hướng yếu | +1,1 | +2,9 | +11,1 (±18,0) | 46% |
| LN kỳ vọng ≥ 25% | +1,2 | +3,3 | +11,3 (±12,4) | 63% |
| Mã "chờ điều chỉnh" | +0,4 | +0,6 | +0,2 (±3,4) | 56% |
| Mã "vùng chốt lời" | −0,8 | −1,7 | −4,2 (±4,6) | 16% |
| LN kỳ vọng < 10% | −0,7 | −1,6 | −3,9 (±4,6) | 31% |

Các số ở ba cột giữa là chênh lệch so với mặt bằng, tính bằng điểm phần trăm.

### Hiệu chuẩn "LN kỳ vọng" (12 tháng, chia 5 nhóm)

| Nhóm | LN kỳ vọng TB | Lợi suất thật TB | Hơn mặt bằng |
|---|---|---|---|
| 1 (thấp nhất) | −20,3% | +9,3% | −5,7 |
| 2 | −1,9% | +11,6% | −3,5 |
| 3 | +8,1% | +11,7% | −3,4 |
| 4 | +19,3% | +16,1% | +1,0 |
| 5 (cao nhất) | +38,3% | +27,1% | +12,0 |

Theo năm, nhóm cao nhất thắng nhóm thấp nhất trong 70% / 92% / 70% số tháng (2023 / 2024 / 2025).

### Sức dự báo từng thành phần điểm (hệ số tương quan hạng với lợi suất 12 tháng)

| Chỉ số | IC trung bình | Ghi chú |
|---|---|---|
| LN kỳ vọng | 0,167 | 94% số tháng dương, ±0,071 |
| Định giá | 0,164 | 94% số tháng dương |
| Tiềm năng giá | 0,164 | |
| Tăng trưởng | 0,148 | 84% số tháng dương |
| Điểm tổng | 0,144 | |
| An toàn | 0,112 | nhiễu, ±0,159 |
| Chất lượng | 0,055 | yếu |
| Cổ tức | −0,021 | không có tác dụng |

Với 3 tháng, các IC chỉ khoảng 0,02–0,06 và thường nằm trong sai số, nên tín hiệu ngắn hạn yếu.

### Mô phỏng giao dịch theo vùng mua → vùng bán/cắt lỗ (tối đa 12 tháng, sau phí)

| Quy tắc thoát lệnh | Số lệnh | Lợi suất TB/lệnh | Tỷ lệ lãi | Chạm vùng bán | Cắt lỗ | Hết 12T | Lãi TB | Lỗ TB |
|---|---|---|---|---|---|---|---|---|
| Quy tắc của web | 630 | +7,6% | 55% | 49% | 42% | 10% | +26,0% | −14,4% |
| Không cắt lỗ | 630 | +14,4% | 75% | 64% | 0% | 36% | +25,4% | −18,2% |
| Cắt lỗ cố định 15% | 630 | +8,2% | 57% | 51% | 39% | 10% | +26,0% | −15,7% |
| *Cầm cùng các mã 12 tháng* | | *+27,7%* | | | | | | |

## 4. Kiểm tra độ bền

| Thay đổi | Top 20 hơn mặt bằng 12T | IC của LN kỳ vọng 12T | Nhóm 5: dự báo / thực tế |
|---|---|---|---|
| Gốc | +1,5 | 0,167 | 38% / 27% |
| Trễ báo cáo 90 ngày | +2,0 | 0,161 | 38% / 27% |
| Trần tiềm năng +35% thay +60% | +1,5 | 0,169 | 32% / 27% |

Kết luận không đổi. Hạ trần gần như không thay đổi thứ hạng, chỉ làm con số hiển thị gần thực tế hơn.

## 5. Giới hạn cần biết

1. **Thời gian ngắn và thiên về thị trường tăng:** 3,7 năm, mặt bằng trung bình +15%/năm, không có giai đoạn giảm sâu như 2022. Chưa thể nói gì về hiệu quả khi thị trường giảm.
2. **Số quan sát độc lập rất ít** (khoảng 2,7 cho 12 tháng). Hầu hết chênh lệch nằm trong sai số.
3. **Dữ liệu cơ bản mô phỏng "đã công bố"** bằng độ trễ 45 ngày, không phải ngày công bố thật. Dữ liệu nguồn có thể đã được điều chỉnh về sau.
4. **Giả định giao dịch:** không tính giá trần/sàn, T+2, trượt giá lớn, hay việc không mua được số lượng lớn. Cắt lỗ giả định khớp ở mức cắt lỗ hoặc giá đóng cửa nếu thấp hơn.
5. **Nhóm ngành và nhãn VN30 lấy theo hiện tại**, sai khác nhỏ so với quá khứ.
6. **Không có chuỗi VN-Index** nên mốc so sánh là trung bình các mã đạt lọc của chính web, không phải thị trường chung.
7. Báo cáo do một mô hình duy nhất thiết kế, viết mã và rà soát. Nên nhờ thêm một người hoặc một mô hình độc lập (ví dụ Opus) kiểm tra lại phương pháp trước khi dựa vào kết quả để chỉnh công thức.

## 6. Gợi ý cho Giai đoạn 3 (chỉnh mô hình)

Các gợi ý dưới đây chỉ nên áp dụng sau khi kiểm tra ngoài mẫu (chỉnh trên 2023–2024, kiểm tra trên 2025–2026) để tránh khớp quá mức.

1. **Cách hiển thị:** gọi là "điểm tiềm năng tương đối" hoặc hiển thị theo thứ hạng (nhóm 1–5), kèm khoảng thực tế quan sát, thay vì "+38%". Dự báo tuyệt đối đang cao hơn thực tế khoảng 10 điểm %.
2. **Xếp hạng Top 20:** thử xếp theo "LN kỳ vọng" (hoặc tổ hợp Định giá + Tăng trưởng) thay vì điểm tổng. Thử giảm tỷ trọng Cổ tức (0,10 → thấp hơn) và Chất lượng.
3. **Cắt lỗ:** thử mức dựa trên độ biến động (ví dụ 2,5–3 lần ATR) và sàn tối thiểu 12%, so với quy tắc hiện tại.
4. **Cảnh báo mức bão hoà** (đã có trong script kiểm tra dữ liệu) nên hiển thị cho người dùng khi quá 50% số mã ở vùng mua.
5. **Tiếp tục lưu bản chụp hằng ngày** (đã thêm ở Giai đoạn 0) để có kiểm chứng thật mà không cần dữ liệu suy ra.
6. Mở rộng lịch sử về 2019–2022 nếu tìm được nguồn BVPS và EPS theo thời điểm, để có thêm giai đoạn thị trường giảm.

## 7. Giai đoạn 3: thay đổi đã áp dụng (24/11/2026)

### Cách làm
- Chốt trước danh sách phương án (7 phương án, file `scripts/backtest/variants.json`), chạy tất cả, không thêm phương án sau khi xem kết quả (trừ một phương án ghép trọng số mới với trần +35%).
- Chia thời gian: **giai đoạn học** là các tín hiệu trước 07/2024 (16 tín hiệu), **giai đoạn kiểm tra** là từ 07/2024 (29 tín hiệu, nhưng chỉ 16 có kết quả 12 tháng; xem mục 0 về việc giai đoạn này không phải kiểm chứng sạch).

### Kết quả các phương án xếp hạng Top 20 (hơn mặt bằng sau 12 tháng, điểm %)

| Phương án | Học | Kiểm tra | Toàn bộ | Tỷ lệ tháng hơn mặt bằng (toàn bộ) |
|---|---|---|---|---|
| Gốc (25/15/20/30/10) | +3,3 | −0,3 | +1,5 | 56% |
| **Trọng số mới (15/20/30/30/5)** | **+5,0** | **+5,5** | **+5,2** | **72%** |
| Xếp theo tiềm năng ước tính | +3,0 | +1,8 | +2,4 | 63% |
| Pha trộn điểm tổng + tiềm năng | +4,3 | +1,7 | +3,0 | 66% |
| Trọng số mới + pha trộn | +4,4 | +2,6 | +3,5 | 72% |

(Đã điều chỉnh sau rà soát: đây là kết quả trong dữ liệu đã dùng để chọn trọng số, không phải kiểm chứng ngoài mẫu.) Phương án trọng số mới tốt hơn gốc ở **cả hai giai đoạn và cả ba năm** (2023: +3,0 so với +2,6; 2024: +3,0 so với −3,1; 2025: +10,0 so với +5,9).

### Đã áp dụng
1. **Trọng số điểm:** Chất lượng 25→15, Tăng trưởng 15→20, Định giá 20→30, An toàn 30 (giữ), Cổ tức 10→5.
2. **Trần tiềm năng tăng giá:** 60% → 35%. Không đổi thứ hạng đáng kể; nhóm cao nhất hiển thị +32% so với thực tế +27% (trước đây +38%). Đổi lại, kết quả giao dịch giả lập kém hơn (xem mục 0, điểm 4); đây là một đánh đổi cần cân nhắc, không phải cải thiện thuần túy.
3. **Đổi tên "LN kỳ vọng" thành "Tiềm năng ước tính"** trên toàn web, thêm mục "Kiểm chứng trong quá khứ" ở tab Phương pháp.
4. **Cảnh báo bão hoà:** hiển thị khi từ 50% số mã đạt lọc cùng ở vùng mua.

### Không áp dụng (và vì sao)
- **Xếp Top 20 theo tiềm năng ước tính / pha trộn:** kém trọng số mới ở giai đoạn kiểm tra.
- **Nới rộng cắt lỗ (10%/20%/3×ATR hoặc 12%/25%/3,5×ATR):** lợi suất mỗi lệnh chỉ tăng +1,3 đến +1,8 điểm % (đều nằm trong sai số) nhưng mức thua tệ nhất (5% lệnh thấp nhất) xấu hơn từ −19% xuống −23% đến −24%. Giai đoạn kiểm tra là thị trường tăng nên thiên về cắt lỗ rộng. Giữ nguyên mức cũ; tham số `stop` đã có sẵn trong `engine.js` để thử lại khi có thêm dữ liệu giai đoạn giảm.

### Cảnh báo về mức tin cậy
- **Trọng số mới được chọn sau khi xem kết quả toàn bộ giai đoạn**, trong đó giai đoạn kiểm tra chiếm phần lớn. Vì vậy "giai đoạn kiểm tra" không phải kiểm chứng sạch hoàn toàn. Chỉ số tương quan từng thành phần không ổn định giữa hai giai đoạn: Chất lượng +0,18 (học) rồi −0,07 (kiểm tra); Cổ tức +0,11 rồi −0,15; An toàn +0,01 rồi +0,21. Chỉ **Tăng trưởng** dương ở cả hai (+0,15 và +0,15). Có thể phần cải thiện chỉ phản ánh đặc điểm của giai đoạn 2023–2026.
- Số quan sát độc lập vẫn chỉ khoảng 2,7 cho 12 tháng. Top 20 mới: +5,2 điểm % với sai số ±5,9.
- Cách kiểm chứng đúng là **dữ liệu thật tích lũy từ nay** (bản chụp hằng ngày đã được bật). Nên xem lại sau 6–12 tháng, và nhanh chóng hoàn nguyên nếu kết quả thật không theo kịp.

### Quan sát mới sau thay đổi
- Với trần 35%, **18/20 mã Top 20 chạm đúng trần** (hiển thị 35,0%). Tiềm năng ước tính khi đó không còn phân biệt được các mã đầu bảng; thứ hạng chủ yếu dựa vào điểm tổng. Đây là dấu hiệu mô hình đang thấy gần như mọi mã đều "rẻ" (định giá hồi phục một nửa về trung vị), không nên xem là cơ hội đồng loạt.
- 61% số mã đạt lọc ở vùng mua, cao nhất từ đầu dữ liệu kiểm chứng (trước đó tối đa 42%).

## 8. Cách chạy lại

```
node scripts/backtest/fetch-history.mjs     # tải dữ liệu lịch sử (khoảng 2–3 phút, một lần)
node scripts/backtest/run-backtest.mjs --label goc
node scripts/backtest/print-report.mjs goc
```

Có thể thêm `--lag 90`, `--maxUpside 0.35`, `--cost 0.006`, `--from 2023-03`.
