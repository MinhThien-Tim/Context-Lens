# PDF OCR — giai đoạn 3

## Đã triển khai

- Phân loại theo từng trang bằng chất lượng trích xuất và lượng chữ. Trang có trích xuất tốt luôn dùng chữ PDF; chỉ trang thiếu chữ mới đề xuất OCR. Cache OCR được tách theo tài liệu, trang, ngôn ngữ và phiên bản cấu hình.
- Giữ số trang và phần vị trí tương đối trong trang khi chuyển giữa Trang gốc và Đọc chữ. Chế độ đang đọc và lựa chọn ngôn ngữ OCR được lưu với tài liệu để mở lại. Ghi chú OCR tiếp tục gắn với trang PDF.
- Có lựa chọn English (mặc định) và English + Vietnamese. Bộ ngôn ngữ chỉ tải khi người dùng bấm nhận dạng. Worker OCR được tái sử dụng khi cùng ngôn ngữ và thay worker khi đổi ngôn ngữ.
- Không thêm lớp chữ OCR lên Trang gốc: kết quả hai cột và chữ có dấu chưa đủ ổn định để bảo đảm vùng chọn khớp ảnh. Chọn chữ và tra nghĩa OCR ở Đọc chữ; Trang gốc luôn mở lại được.

## Kiểm tra

- `npm run typecheck`, `npm test` (278 đạt, 1 bỏ qua), `npm run build` đạt.
- Playwright PDF hỗn hợp hai trang trên laptop và cấu hình điện thoại: trang chữ không hiện nút OCR; trang scan nhận dạng được; chuyển trang, chuyển chế độ, đóng và mở lại đúng trang.
- Fixture song ngữ rõ 1224×1584: nhận được câu English và Vietnamese, nhưng `học` thành `hoc`; do đó giao diện tiếp tục cảnh báo chữ nhận dạng có thể sai. Thời gian OCR ở Chromium thử nghiệm: laptop khoảng 3,05 giây, cấu hình Pixel 7 khoảng 2,50 giây mỗi trang fixture. Đây không phải phép đo trên điện thoại vật lý hay cam kết tốc độ.
- Dữ liệu tải lần đầu quan sát: `eng.traineddata.gz` khoảng 2,95 MB; `vie.traineddata.gz` khoảng 1,42 MB. Chọn English không yêu cầu tải bộ Vietnamese. Dung lượng cache thực tế tùy trình duyệt.

## Giới hạn và bước tiếp

- OCR hai cột có thể trộn thứ tự dòng; scan mờ hoặc chữ tiếng Việt có dấu vẫn cần đối chiếu Trang gốc.
- Chưa đo bộ nhớ đỉnh và thiếu dung lượng trên điện thoại vật lý. Chưa bật OCR nhiều trang hoặc lớp chữ phủ Trang gốc. Giai đoạn 4 cần đo các điều kiện này trước khi triển khai hàng đợi.
