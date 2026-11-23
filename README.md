# Lọc Cổ Phiếu HOSE

Trang web tĩnh, chạy miễn phí trên **GitHub Pages** (tên miền miễn phí dạng `https://ten-cua-ban.github.io`):

- **Top 20 cổ phiếu tốt nhất HOSE** theo điểm tổng hợp (chất lượng, tăng trưởng, định giá, an toàn, cổ tức).
- **Top 10 mã tiềm năng 25–30%/năm, độ an toàn cao** (lợi nhuận kỳ vọng = tăng giá tới giá mục tiêu + cổ tức).
- **Vùng mua, vùng bán (chốt lời), ngưỡng cắt lỗ** cho từng mã, kèm biểu đồ giá 1 năm.
- **Cổ tức hằng năm**, lịch sử chi trả, **ngày GDKHQ và ngày thanh toán**, lịch cổ tức sắp tới của toàn sàn.
- Tự cập nhật sau mỗi phiên (15h45 các ngày thứ 2–6) bằng GitHub Actions; có nút **Cập nhật trực tiếp** để tính lại ngay trong trình duyệt.

> ⚠️ Số liệu được tính tự động bằng công thức cố định, **chỉ để tham khảo, không phải khuyến nghị đầu tư**. Không mô hình nào đảm bảo mức sinh lời 25–30%.

## Cấu trúc

| Đường dẫn | Vai trò |
|---|---|
| `index.html` | Trang chính |
| `assets/style.css` | Giao diện (sáng/tối, tự chuyển sang dạng thẻ trên điện thoại) |
| `assets/app.js` | Hiển thị bảng, biểu đồ, hộp chi tiết |
| `assets/engine.js` | Bộ máy lấy dữ liệu, chấm điểm, tính vùng mua/bán (dùng chung cho trình duyệt và GitHub Actions) |
| `scripts/update-data.js` | Chạy bộ máy và ghi `data/stocks.json` |
| `data/stocks.json` | Dữ liệu đã tính sẵn |
| `.github/workflows/update.yml` | Lịch tự cập nhật và đăng trang |
| `package.json` | Khai báo dự án (không cần cài thư viện nào) |

## Đưa trang lên mạng miễn phí (không cần cài Git)

1. **Tạo tài khoản GitHub** miễn phí tại <https://github.com/signup>.
2. **Tạo kho (repository) mới**: bấm **+** → **New repository**.
   - Đặt tên `ten-tai-khoan.github.io` (thay `ten-tai-khoan` bằng tên tài khoản GitHub của bạn) để có địa chỉ gọn `https://ten-tai-khoan.github.io`.
     Nếu đặt tên khác, ví dụ `loc-co-phieu`, địa chỉ sẽ là `https://ten-tai-khoan.github.io/loc-co-phieu/`.
   - Chọn **Public**, bấm **Create repository**.
3. **Tải mã nguồn lên**: trong kho vừa tạo bấm **uploading an existing file**, kéo thả vào:
   `index.html`, `package.json`, `README.md` và 3 thư mục `assets`, `data`, `scripts` → bấm **Commit changes**.
4. **Tạo file tự cập nhật**: bấm **Add file → Create new file**, gõ tên
   `.github/workflows/update.yml`, dán toàn bộ nội dung file `update.yml` trong thư mục `.github/workflows` vào, bấm **Commit changes**.
5. **Bật GitHub Pages**: **Settings → Pages → Build and deployment → Source:** chọn **GitHub Actions**.
6. **Chạy lần đầu**: tab **Actions** → chọn **Cập nhật dữ liệu và đăng trang** → **Run workflow**. Chờ khoảng 2–3 phút đến khi có dấu ✓ xanh.
7. Mở `https://ten-tai-khoan.github.io` — xong. Từ đây trang tự cập nhật mỗi ngày giao dịch.

### Nếu gặp lỗi

- **Bước "Lưu dữ liệu mới vào kho" báo lỗi quyền**: vào **Settings → Actions → General → Workflow permissions**, chọn **Read and write permissions**, lưu lại rồi chạy lại.
- **Bước "Lấy dữ liệu" thất bại** (nguồn dữ liệu có thể chặn máy chủ ở nước ngoài): trang vẫn được đăng với dữ liệu cũ, và người xem bấm **Cập nhật trực tiếp** để tính bằng số liệu mới nhất. Bạn cũng có thể chạy trên máy mình rồi tải `data/stocks.json` lên lại:
  ```
  node scripts/update-data.js
  ```
  (cần Node.js 18 trở lên, tải tại <https://nodejs.org>).
- **Lịch tự chạy dừng**: GitHub tạm tắt lịch chạy nếu kho không có hoạt động trong 60 ngày. Vào tab **Actions** và bấm **Enable workflow** để bật lại.
- **Muốn dùng tên miền riêng** (nếu sau này mua): **Settings → Pages → Custom domain**.

## Chạy thử trên máy

```
node scripts/update-data.js
npx --yes http-server -p 8080 -c-1 .
```
Rồi mở <http://localhost:8080>. (Cần mở qua máy chủ web; mở trực tiếp file `index.html` sẽ không tải được dữ liệu.)

## Tuỳ chỉnh tiêu chí

Sửa `CONFIG` ở đầu file `assets/engine.js`:

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `minMarketCap` | 3.000 tỷ | Vốn hoá tối thiểu |
| `minLiquidity` | 5 tỷ/phiên | Giá trị giao dịch bình quân 10 phiên tối thiểu |
| `minReturn` | 25% | LN kỳ vọng tối thiểu khi mua ở cận trên vùng mua |
| `top10Tiers` | 25–45%, an toàn ≥ 60, chất lượng ≥ 50 | Tiêu chí Top 10 (mức đủ và mức nới lỏng) |
| `weights` | 25/15/20/30/10 | Tỷ trọng chất lượng/tăng trưởng/định giá/an toàn/cổ tức |
| `maxUpside` | 60% | Trần tiềm năng tăng giá của mô hình |
| `maxPerSector` | 5 (Top 20), 3 (Top 10) | Giới hạn số mã cùng ngành |

Chi tiết công thức xem tab **Phương pháp** trên trang.

## Nguồn dữ liệu

VNDirect Finfo API công khai (`api-finfo.vndirect.com.vn`): danh sách mã, giá, P/E, P/B, ROE, EPS, beta, lịch sự kiện quyền (cổ tức), giá mục tiêu của các công ty chứng khoán. Nguồn này không chính thức cam kết ổn định; nếu thay đổi, cần sửa `assets/engine.js`.
