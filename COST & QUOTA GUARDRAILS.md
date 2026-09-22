# Cost & Quota Guardrails

Tài liệu này là ràng buộc kiến trúc bắt buộc của Context Lens. Mục tiêu là giữ ứng dụng hoạt động được khi không có mạng, không phát sinh hóa đơn ngoài dự kiến và không biến thao tác đọc thông thường thành lưu lượng Worker hoặc dịch vụ trả phí.

## 1. Nguyên tắc không thương lượng

1. **Local/static là mặc định.** Mọi tính năng phải chạy trong trình duyệt hoặc từ static assets nếu có thể.
2. **Cache-first trước network.** Không được tạo request mạng khi đã có kết quả hợp lệ trong memory cache, IndexedDB/Dexie, Cache Storage hoặc gói dữ liệu local.
3. **Worker API là deny-by-default.** Chỉ endpoint được liệt kê trong tài liệu này mới được chạy logic Worker hoặc gọi upstream. Mọi `/api/*` khác phải trả `404` và không được âm thầm fallback sang dịch vụ khác.
4. **Hết quota thì giảm cấp an toàn.** Trả lỗi có cấu trúc, giữ nguyên trải nghiệm đọc local và không retry tự động, không chuyển sang paid provider.
5. **Không có chi phí ngầm.** Không được tự ý thêm hoặc bật paid API, Cloudflare R2, D1, Workers AI/AI Gateway, Vectorize, Queues, KV trả phí, dịch vụ AI trả phí hay bất kỳ tài nguyên có billing nào.

## 2. Tính năng bắt buộc local/static

Các luồng sau **không được** tạo Worker API request hoặc gọi dịch vụ bên thứ ba:

- Mở, parse, render và điều hướng EPUB, PDF, DOCX, Markdown, HTML và text.
- Thư viện tài liệu, mục lục, vị trí đọc, theme, font, layout và cài đặt.
- Tra từ EN/EN và EN/VI bằng dictionary pack đi kèm; phrase lookup và sense resolution.
- Trích xuất ngữ cảnh câu trước/hiện tại/sau; các rule giải thích Context/Grammar local.
- Highlight, note, vocabulary/flashcard, collection và tìm kiếm dữ liệu cá nhân.
- Import/export/backup/restore và quản lý storage/cache.
- Service worker, app shell, lazy chunks, font, icon và các static assets của ứng dụng.
- Chuyển tab EN/VI, mở lại kết quả đã có và mọi thao tác UI không đòi hỏi dữ liệu mới.

Browser-local AI hoặc model chạy trên thiết bị được phép nếu không dùng dịch vụ tính phí, chỉ chạy sau hành động rõ ràng của người dùng và không tự động fallback ra network.

Các provider do người dùng tự cấu hình chỉ được gọi sau opt-in rõ ràng, phải tách khỏi hạ tầng do dự án chi trả và không được coi là lý do để thêm credential hoặc billing của dự án.

## 3. Worker surface được phép

| Route | Method | Mục đích | Có được gọi upstream? | Hard quota |
| --- | --- | --- | --- | --- |
| `/api/translate` | `POST` | Pilot dịch EN↔VI khi local/cache không đủ và người dùng đã bật Online translation | Có; tuần tự qua provider được allowlist, không fan-out | Theo mục 4 |
| Mọi `/api/*` khác | Mọi method | Không được phép | Không | **0 request được chấp nhận**; trả `404` |

Static asset/navigation request có thể được Cloudflare Assets phục vụ, nhưng không được chạy logic API, Durable Object hoặc upstream fetch. `run_worker_first` phải tiếp tục chỉ áp dụng cho `/api/*`.

Không được thêm endpoint mới bằng cách chỉ sửa code. Mọi endpoint mới cần đồng thời:

- cập nhật tài liệu này với mục đích và hard quota cụ thể;
- có cache strategy, kill switch, validation, timeout và test fail-closed;
- được chủ dự án phê duyệt rõ ràng trước khi merge/deploy;
- chứng minh không yêu cầu dịch vụ trả phí hoặc tài nguyên bị cấm.

## 4. Hard quota cho `POST /api/translate`

Các giới hạn này là trần, không phải mục tiêu sử dụng:

| Phạm vi | Giới hạn cứng |
| --- | ---: |
| Toàn deployment / ngày UTC | 500 upstream attempts |
| Toàn deployment / ngày UTC | 100.000 Unicode code points |
| Mỗi IP đã HMAC-hash / ngày UTC | 50 upstream attempts |
| Mỗi IP đã HMAC-hash / ngày UTC | 10.000 Unicode code points |
| Mỗi IP / cửa sổ trượt 60 giây | 6 upstream attempts |
| Toàn deployment đồng thời | 2 upstream attempts |
| Một selection | 1.000 Unicode code points |
| Request body | 8 KiB |
| Upstream response | 32 KiB |
| Lease đồng thời | 30 giây |
| Google upstream deadline | 2 giây, gồm cả đọc body |

Quy tắc tính quota:

- Reserve quota bằng transaction **ngay trước** mỗi upstream attempt.
- Attempt lỗi, timeout hoặc bị hủy sau khi đã reserve vẫn tính quota và không được hoàn lại.
- `auto` chỉ thử provider tuần tự; không gọi song song. Rejection do global/daily/rate/concurrency quota không được fan-out sang provider khác.
- Storage/bộ đếm lỗi phải fail closed. Không được bỏ qua quota để “giữ tính năng hoạt động”.
- Một Durable Object ổn định tên `global-pilot-v1` giữ admission toàn deployment. Không shard, đổi tên hoặc tạo object mới để né/reset quota.
- `ONLINE_ENABLED=false` là trạng thái mặc định và kill switch tức thời.
- Không tự động retry request upstream. Circuit breaker/cooldown phải được giữ nguyên; không xoay endpoint, IP hoặc proxy khi upstream chặn.

Hard quota phải tồn tại trong code phía server và có test; giới hạn ở UI/client không được xem là biện pháp kiểm soát chi phí. Mọi thay đổi làm quota cao hơn cần phê duyệt rõ ràng của chủ dự án và cập nhật đồng thời `gateway/src/quota.ts`, test, `gateway/README.md` và tài liệu này.

## 5. Cache-first bắt buộc

Thứ tự xử lý cho thao tác dịch/giải thích là:

1. memory cache;
2. IndexedDB/Dexie cache;
3. dictionary, phrase data và rule local;
4. browser-local model đã sẵn sàng, nếu người dùng cho phép;
5. chỉ sau đó mới xét network provider đã được người dùng bật;
6. managed Worker `/api/translate` là bước cuối cùng trong nhánh được phép.

Yêu cầu triển khai:

- Cache key phải bao gồm nội dung đã normalize, cặp ngôn ngữ, mode/task, provider khi cần và schema/prompt version để tránh trả sai ngữ cảnh.
- Kết quả network thành công phải được lưu vào device cache trước lần dùng lại tiếp theo; đổi tab, đóng/mở panel hoặc reload không được tạo request trùng nếu cache còn hợp lệ.
- Các request giống nhau đang chạy phải được deduplicate/shared; hủy consumer không được tạo request thay thế.
- Negative cache/cooldown được phép cho lỗi ổn định để tránh retry storm, nhưng không được che kết quả local.
- Offline, timeout, quota exhaustion, `429`, `503` hoặc upstream failure phải trả về cache/local fallback; không được làm hỏng luồng đọc.
- Không lưu nội dung sách, selection, bản dịch hoặc raw upstream body trên server. Response động tiếp tục dùng `Cache-Control: no-store`; cache nội dung nằm trên thiết bị.

## 6. Dịch vụ và dữ liệu bị cấm nếu chưa có phê duyệt

Không được tự ý:

- thêm API key, billing account, subscription hoặc credit card của dự án;
- tích hợp Google Cloud Translation, Azure Translator, OpenAI, Anthropic, Gemini hoặc API AI/translation trả phí khác;
- tạo/bind Cloudflare R2, D1, Workers AI/AI Gateway hoặc dịch vụ lưu trữ/compute tính phí;
- chuyển document, note, vocabulary, selection, prompt hoặc cache của người dùng lên server;
- bật telemetry/observability có chi phí hoặc ghi log raw request/response;
- dùng token scraping, IP rotation, proxy bên thứ ba hoặc cơ chế né rate limit.

Durable Object SQLite hiện tại chỉ được dùng cho counter, hashed-IP bucket, lease và provider health của quota gate. Đây **không phải D1** và không được mở rộng thành nơi lưu document, translation cache hay dữ liệu người dùng.

Nếu một thay đổi thật sự cần dịch vụ bị cấm, phải dừng ở proposal: nêu nhà cung cấp, dữ liệu gửi đi, pricing và worst-case monthly cost, quota/budget cap, retention, privacy, kill switch và phương án local fallback. Chỉ được triển khai sau phê duyệt rõ ràng của chủ dự án.

## 7. Checklist bắt buộc khi review/deploy

- [ ] Tính năng mới đã ưu tiên local/static và không phát request khi cache hit.
- [ ] Không có route `/api/*`, binding hoặc upstream mới ngoài allowlist.
- [ ] Hard quota, payload limit, timeout, concurrency và kill switch có test fail-closed.
- [ ] Không có dependency/config/secret cho paid API, R2, D1 hoặc AI service.
- [ ] Không log hay lưu server-side nội dung người dùng.
- [ ] `ONLINE_ENABLED` vẫn mặc định `false`; staging được kiểm chứng trước production.
- [ ] Khi gateway tắt/hết quota/lỗi, đọc tài liệu và tính năng local vẫn hoạt động.

Nếu code, cấu hình hoặc tài liệu khác mâu thuẫn với guardrail này, áp dụng phương án có chi phí thấp hơn và ít network hơn cho đến khi chủ dự án phê duyệt thay đổi.
