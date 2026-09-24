# PDF OCR — giai đoạn 4

## Phạm vi

- Khi nhập hoặc mở PDF, ứng dụng tự xét tối đa 12 trang đầu. Chỉ trang trích xuất rỗng, `poor`, có dấu hiệu ảnh/mực và chưa có cache mới được OCR. Trang có lớp chữ dù trích xuất chưa tốt vẫn cần OCR thủ công. Thanh tiến độ đọc hiện tiến độ OCR trong lúc chạy rồi trở lại tiến độ đọc. Có thể tạm dừng hoặc hủy việc chuẩn bị này; các trang sau trang 12 vẫn cần thao tác OCR thủ công theo lát 3/6 trang.
- Menu **Đọc chữ** có OCR trang hiện tại và xét tối đa 3 hoặc 6 trang kế tiếp. Lệnh nhiều trang chỉ nhận dạng trang `poor` có toán tử ảnh/nét vẽ và ảnh thu nhỏ chứa mực; bỏ qua trang trắng, chữ PDF tốt và OCR hợp lệ. Trang có lớp chữ nhưng trích xuất lỗi vẫn có thể OCR thủ công.
- Một hàng đợi tuần tự và một Tesseract worker. Có tiến độ, tạm dừng sau trang đang chạy, tiếp tục, hủy, lỗi và chạy lại. Worker đóng khi hủy/đóng tài liệu hoặc sau 60 giây rảnh. Canvas OCR được giải phóng sau từng trang; khi OCR chạy ở Trang gốc, canvas trang kề được tháo khỏi vùng xem.
- OCR lưu text và các đoạn chữ, không lưu raster. Khóa cache gồm hash SHA-256 của PDF, trang, ngôn ngữ, phiên bản OCR và giới hạn raster. Cache giai đoạn trước được chuyển sang khóa mới mà không OCR lại khi cùng cấu hình 3 triệu pixel.
- Vị trí PDF lưu trang, độ lệch trong trang và nguồn chữ; ghi chú OCR giữ offset cục bộ. Kết quả OCR không sửa văn bản PDF gốc hoặc global offsets. Chỉ một nguồn chữ hiện ở mỗi trang.
- Có lệnh xóa OCR của tài liệu. Tài liệu PDF, từ đã lưu và ghi chú vẫn được giữ. Khi dung lượng ước lượng còn dưới 1 MB hoặc không tạo được canvas, hàng đợi báo lỗi và không lưu kết quả dở.
- Worker, core và `eng`/`vie` traineddata được phục vụ cùng origin. Khi mở PDF có trang scan cần OCR trong 12 trang đầu, tài nguyên `eng` tải lúc hàng đợi bắt đầu; PDF chỉ có chữ tốt không tải OCR. `vie` chỉ tải khi chọn English + Vietnamese. Các tệp OCR và chunk OCR nằm ngoài PWA precache; service worker dùng CacheFirst cho tài nguyên OCR đã tải.
- Không có OCR toàn cuốn, lớp chữ phủ lên Trang gốc hoặc vision API fallback.

## Đo và kiểm tra

- Fixture chữ nhỏ 1224×1584, 28 dòng, Chromium laptop mô phỏng: 1,5 triệu pixel 7,08 giây; 2 triệu pixel 8,30 giây; 3 triệu pixel 7,74 giây. Cả ba nhận đủ 28 cụm thử. Đây là **một lần đo cho mỗi mức**, gồm thời gian tải và khởi tạo, nên chưa đủ để khẳng định mức nào nhanh hơn. Mặc định vẫn là trần 3 triệu pixel để giữ chất lượng chữ nhỏ; raster không phụ thuộc zoom hiển thị.
- Sau khi thêm tự chuẩn bị, một lần đo từ lúc chọn file scan tới khi có chữ trên Chromium laptop là 9,85 giây ở trần 3 triệu pixel, 28/28 dòng; JS heap trước/sau khoảng 91,0/123,6 MB. Thời gian này gồm import PDF, khởi tạo và OCR, không đại diện cho mọi thiết bị.
- `performance.memory.usedJSHeapSize` trước/sau ở các lần đo lần lượt khoảng 112,9/123,4 MB (1,5 triệu), 121,2/132,0 MB (2 triệu), 101,5/112,6 MB (3 triệu). Chỉ số này không bao gồm đầy đủ WASM/canvas và không phải bộ nhớ đỉnh hay phép đo trên điện thoại vật lý.
- Tài nguyên tải lần đầu quan sát: `eng.traineddata.gz` 2.952.873 byte; `vie.traineddata.gz` 1.423.003 byte. `eng` không tải `vie`. Core/worker được tải theo khả năng SIMD của trình duyệt. Bài kiểm tra hàng đợi xác nhận không có request OCR đến origin bên ngoài.
- Fixture PDF hỗn hợp gồm trang chữ, scan, ảnh trắng, scan, scan: lệnh 3 trang xử lý hai trang scan; lệnh 6 trang sau đó xử lý trang còn thiếu. Kiểm tra tạm dừng/tiếp tục, hủy, xóa OCR, thiếu dung lượng và lỗi tạo canvas trên laptop và cấu hình Pixel 7 trong Chromium.
- Sau thay đổi tự chuẩn bị: fixture 13 trang xác nhận OCR trang scan 1, không OCR trang scan 13 trước khi người đọc gọi lệnh cho các trang tiếp. Fixture hỗn hợp xác nhận ba trang scan được OCR, trang trắng được bỏ qua, thanh tiến độ trở về tiến độ đọc. Hai PDF mẫu được thử lại trên Chromium laptop; PDF scan 7 trang được OCR khi mở, trang bìa có chữ PDF vẫn dùng OCR thủ công.
- Hai PDF người dùng cung cấp: trang bìa *They Say / I Say* nhận dạng thủ công rồi đổi qua lại Chữ PDF/Chữ OCR, các trang thân 13/14/16 tiếp tục đọc chữ PDF không OCR; bản scan *How to Read a Book* dạng split 7 trang OCR trang đầu, OCR thêm ba trang tiếp theo và quay lại Trang gốc. Các bài kiểm tra này qua trên laptop và cấu hình điện thoại Chromium. Trang 8 của PDF chữ là trang trắng nên không dùng làm mẫu đoạn văn.

## Tài nguyên và giới hạn

- Tesseract.js 7 và tesseract.js-core 7: Apache-2.0 từ dependency đã khóa. Dữ liệu `4.0.0_best_int` lấy từ `@tesseract.js-data/eng` và `@tesseract.js-data/vie`; [nguồn dữ liệu Tesseract](https://github.com/tesseract-ocr/tessdata_best) dùng Apache-2.0. Bản sao giấy phép ở `public/ocr/LICENSE.txt`; thông báo giấy phép của worker đóng gói ở `public/ocr/worker.min.js.LICENSE.txt`. SHA-256: `eng` `45B4CB346724AC1774F1C36F42F182B887BCDB28EBE63E6FFF90AC41F3FCFF91`; `vie` `2284F610F262A1B19EC8DF9F196B9FF6CE38DDB4A66329E998941DF4B8961C8D`.
- Chưa đo bộ nhớ đỉnh/WASM, nhiệt và thời lượng pin trên điện thoại vật lý; chưa thử PDF sát giới hạn 50 MB trong điều kiện thiết bị ít RAM. Lệnh bị giới hạn tối đa 6 trang tiếp cho đến khi có dữ liệu này.
- OCR vẫn có thể sai với chữ cách điệu, scan mờ, hai cột hoặc tiếng Việt có dấu. Trang gốc luôn mở được để đối chiếu.
