# Tóm tắt session — Reader redesign (Context Lens)

Cập nhật: 2026-10-07. Nguồn sự thật cho thiết kế là [reader-behavior-contract.md](reader-behavior-contract.md), [reader-chrome.md](reader-chrome.md), [reader-redesign-phases.md](reader-redesign-phases.md) và [change-dependencies.md](change-dependencies.md); file này chỉ là bản đồ và nhật ký quyết định.

## 1. Bối cảnh và kết luận

- Repo: nhánh `rebuild/reader-v2`, tip `8ec43ca` ("docs new for reader-v2"); `f264c3e` là baseline (tag `pre-rebuild`). Docs đã là đích; **code Reader vẫn là chrome cũ** (`interfaceMode`, nút Notes/Markup/Print, zoom Footer mobile). R0 và R0b hoàn tất (một worktree, luật change-propagation, `change-dependencies.md`, task template 7 trường, `verify:fast` xanh).
- Kết luận: **làm lại thay vì sửa baseline**. Lý do: (1) 3 trong 5 regression (C, D, E) kiểm tra chrome sắp bị thay; (2) regression A (nút Simple disabled) tự biến mất khi bỏ `interfaceMode`; (3) số liệu cũ bị nhiễu bởi worktree junction `node_modules`; (4) thiếu luật lan truyền thay đổi nên test lệch dần. Ngoại lệ phải giữ: **B** (`.lookup-sheet .entry-glosses` không hiện) là hành vi thật, giữ thành test `LOOK-1`.

## 2. Kiến trúc docs đích

| File | Vai trò |
| --- | --- |
| `reader-behavior-contract.md` (v2) | WHAT: hành vi quan sát được, mỗi rule có ID = `@tag` của test |
| `reader-chrome.md` | HOW: owner từng component, bố cục theo band, hằng số, CSS, test |
| `change-dependencies.md` | Cách thay đổi lan truyền |
| `reader-redesign-phases.md` | Hướng dẫn từng phase |
| `reader-docs-patches.md` | Chỉ dẫn sửa `reader.md` và `ui-system.md` |

Xoá `reader-chrome-foundation.md`, `mobile-chrome.md`, `desktop-reader.md`. **Không xoá** `reader.md` và `ui-system.md` (còn PDF, OCR, lookup, offline, theme); chỉ thay các đoạn về chrome.

## 3. Quyết định đã chốt

**Chung**
- 1024px là ranh giới duy nhất (≤1023 Mobile, ≥1024 Desktop). Bỏ Simple/Advanced (`interfaceMode`), Home giữ nhánh Simple.
- Giữ giá trị lưu `viewMode` (`original`/`reading`); chỉ nhãn đổi thành **Text | PDF**.
- Text và PDF: tương tự nhau, không giống hệt khi chức năng khác (`MODE-3`).
- Notes không còn là action trong chrome; mã và dữ liệu giữ nguyên (`ARCH-7`). Print xoá hẳn (`ARCH-8`). Giữ `Click lookup`.
- Một font setting (Sans | Serif, bundle local) điều khiển cả chữ đọc và giao diện (`APP-3`).

**Desktop (≥1024)**
- Header giữ bố cục hiện tại, chia nhóm: `Library` · tên file ⌄ | `Text|PDF` | zoom −/level/+ · Contents · Highlight/Underline/Erase · `Aa` · More.
- Bỏ: nút Notes, nút Markup dialog, Print, mũi tên < >, số trang trong Header.
- `Aa` mở panel Theme (font và màu). Tên file mở **File switcher** (panel, không phải menu) để chuyển file hoặc văn bản đã lưu mà không về Home (task P2c).
- Footer: một hàng mỏng gồm số trang (nút mở Go to location), đường tiến độ mỏng, OCR status khi đang chạy. Không hiện %.
- More: Document · Languages · OCR (P4) · Click lookup.

**Mobile (≤1023)**
- Header: Back · title · `Text|PDF`. Footer: một thanh một hàng, toàn chiều rộng: Contents · số trang · Markup · More, đường tiến độ mỏng, không %.
- Đọc toàn màn hình: khi quiet chỉ còn chữ (Header và Footer cùng ẩn). Cuộn xuống ẩn, cuộn lên 32px hiện cả hai, đầu tài liệu luôn hiện, chạm không bật/tắt (chạm dành cho tra từ). `Aa ···` là nút hiện lại khi đang ẩn.
- Không có zoom. More: Document · Theme · Languages · OCR (P4) · Click lookup.
- Hình pill nổi trong ảnh tham khảo chỉ lấy cảm hứng, không áp dụng.

**Zoom**
- Desktop giữ −/level/+. Mobile bỏ stepper; pinch với render lại sau khi ổn định là task sau (Z1 audit và benchmark, rồi Z2). Giữa P2b và Z2, PDF mobile chỉ có fit-width.

## 4. Kế hoạch phase

`P2a` docs + test nền (không đổi UI) → `P2b` chrome và `interfaceMode` → `P2c` File switcher → `Z1` audit/benchmark (chỉ đọc, chạy song song được) → `Z2` pinch → `P3` Theme/font/màu → `P4` OCR → `P5` popup tra từ → `P6` dọn Home → `P7` dọn cuối → `S1` spike bút/canvas (chưa lên lịch).

Cách chạy: mỗi phase một task 7 trường; xong khi các rule ID qua và không còn dấu vết của chrome cũ. Không nới assertion cho xanh; không điều tra spec của contract đã bị xoá. Windows: một working tree, `npm ci`, `PW_REUSE_SERVER=0`, `--strictPort`, chạy tuần tự, không dùng `>` trong PowerShell (UTF-16).

## 5. Việc tiếp theo

1. Giao task **P2a**. Đổi so với bản trước: danh sách nhãn/selector bị xoá gồm cả nút Notes/Markup dialog/Print, mũi tên < > và số trang ở Header, zoom stepper mobile; danh sách hành vi còn sống cần test **không** gồm phân trang Header (`NAV-1` chưa đúng ở P2a) nhưng gồm zoom −/level/+ desktop và nhóm Highlight/Underline/Erase.
2. Chạy Z1 song song, đọc kết quả trước khi quyết định Z2.
3. Sau P2a, kiểm tra báo cáo rồi giao P2b.

## 6. Mục còn mở

| # | Mục | Phase |
| --- | --- | --- |
| 1 | Chủ sở hữu history của Back (bắt đầu bằng audit chỉ đọc các handler hiện có) | P5 |
| 2 | Hình dạng trạng thái OCR hoàn tất; lời thông báo | P4 |
| 3 | Kết quả Z1 quyết định Z2 có làm không | Z2 |
| 4 | Số phận preset Book/News/Academic khi Theme gom Appearance, Colours, Font | P3 |

Đã chốt: Notes không phải action chrome; OCR không tự chạy ngoài preload cục bộ 12 trang đầu, và run tường minh tiếp tục theo cửa sổ 12 trang đến hết; Contents/Pages là hai mục duy nhất, không Outline/clock icon; `Aa ···` ở dưới phải trong safe-area (offset chính xác được ghi ở P2b); Footer mobile dùng nhãn chữ; một font setting điều khiển chữ đọc và giao diện; A/C là Light/Dark của APP-2, B không được chọn.