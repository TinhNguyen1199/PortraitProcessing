# Ảnh Thẻ — xử lý chân dung hàng loạt

Web app chạy **100% trong trình duyệt**: tách nền, căn mặt, cắt ảnh thẻ đúng chuẩn, tải về ZIP.
Không có ảnh nào rời khỏi máy người dùng.

## Kích thước hỗ trợ

Chọn một cỡ mỗi lần; đổi cỡ chỉ ghép lại (~0,12s/ảnh) chứ không chạy lại AI.

| Preset | Khung @300dpi | Cỡ đầu | Hở đỉnh | Dùng cho |
|---|---|---|---|---|
| 2×3 cm | 236×354 | 62% | 9% | Sổ liên lạc, học bạ |
| **3×4 cm** (mặc định) | 354×472 | 62% | 9% | Hồ sơ, học bạ |
| 4×6 cm | 472×709 | 60% | 10% | Sơ yếu lý lịch, hồ sơ xin việc |
| 3,5×4,5 cm | 413×531 | 75% | 7% | Hộ chiếu VN, visa Schengen (ICAO) |
| 5×5 cm (2×2 in) | 591×591 | 60% | 12% | Visa Mỹ |

Hai preset quốc tế bám chuẩn ICAO (đầu chiếm 70–80% chiều cao ảnh; visa Mỹ nới hơn nên để 60%).
Ba preset hành chính VN không có quy định bằng số nên dùng 62% — con số đã nghiệm thu trên ảnh thật.

Người dùng thêm được kích thước riêng (nhập cm, đặt tên) và nó được lưu lại giữa các phiên.
Cỡ đầu / khoảng hở chỉnh tay cũng **nhớ riêng cho từng cỡ**, không lây sang cỡ khác.

Tên file xuất ra luôn kèm hậu tố cỡ (`NguyenVanA_3x4.jpg`) để xuất nhiều cỡ vào cùng thư mục
không đè lên nhau.

```bash
npm install
npm run dev     # http://127.0.0.1:5173
npm run build
```

## Trạng thái: P0 (thử nghiệm) — đã chạy thật trên ảnh của trường

Luồng xương sống đã hoạt động đầu-cuối: thả ảnh → tách nền → căn mặt → cắt 3×4 → duyệt lưới → tải ZIP.

### Số đo thực tế

Máy đo: 8 lõi CPU, 16GB RAM, có WebGPU, Chrome, `crossOriginIsolated` bật (WASM đa luồng).
Ảnh mẫu: **cả 32 ảnh** học sinh 1280×1280, chụp điện thoại, nền bảng xanh có phấn và chói đèn flash.

| Chỉ số | Kết quả |
|---|---|
| Tách nền (MODNet, CPU/WASM) | 976–1456 ms/ảnh tuỳ tải máy |
| Nhận diện khuôn mặt (MediaPipe) | ~145 ms/ảnh |
| Ghép nền + cắt + nén JPEG | ~170 ms/ảnh |
| **Tổng** | **1,3–1,9 s/ảnh** → một lớp 45 em ≈ **60–85 giây** |
| Tải model lần đầu | 25MB, ~7s (lần sau lấy từ cache, ~1,8s) |
| Dung lượng file xuất | 30–36 KB/ảnh (JPEG q92, 354×472px) |
| Ảnh đạt tự động | **32/32, không cảnh báo nào, không lỗi nào** |
| Độ lệch đường mắt cả lô | **±6,6 px** trên khung cao 472px (~1,4%) |
| Tỉ lệ thu phóng | 0,38–0,62× — ảnh gốc thừa pixel, không phải phóng to |
| Độ mềm mask | 0,79–3,5% (dưới 5% là mask khoẻ) |
| RAM trình duyệt với 32 ảnh | **63 MB** |

### Ba phát hiện quan trọng

**1. WebGPU không đáng tin — đã chuyển mặc định sang CPU.**
`onnxruntime-web` chạy WebGPU cho kết quả sai trên máy thử:

- **BiRefNet-lite báo lỗi thẳng**: `Too many storage buffers in shader. Current: 17, Max is 16`.
  Nhiều GPU trên Windows giới hạn 16 storage buffer mỗi shader stage.
- **MODNet âm thầm trả mask hỏng** — nguy hiểm hơn nhiều vì không có thông báo lỗi.
  Cùng một ảnh, cùng một model:

  | | WebGPU | CPU/WASM |
  |---|---|---|
  | Người chiếm khung | 33,1% | 41,4% |
  | Pixel alpha trung gian | **10,59%** | **3,50%** |
  | Mắt thường nhìn | tóc bị coi là nền, ảnh ra đầy vệt xanh | sạch, giữ được sợi tóc |

  Vì vậy có **bộ dò tự động** trong `store.run()`: nếu đang chạy WebGPU mà ảnh đầu tiên có
  hơn 8% pixel ở vùng alpha trung gian, app tự chuyển sang CPU, xử lý lại và báo cho người dùng.

**2. MediaPipe không chạy được trong module worker.**
`FilesetResolver` nạp WASM bằng classic script nên trong worker `type: 'module'` sẽ lỗi
`ModuleFactory not set`. Giải pháp: nhận diện khuôn mặt chạy ở **main thread** (chỉ 150ms/ảnh,
không gây giật), worker chỉ lo tách nền.

**3. Khung cắt vượt mép ảnh gốc KHÔNG phải lỗi.**
Lần chạy đầu trên 32 ảnh gắn cờ "đỉnh đầu bị cắt" cho 4 ảnh. Soi lại thì cả 4 đều là báo động
giả: khung 3×4 vươn lên quá mép trên ảnh gốc, nhưng phần thiếu đó vốn là nền — mà nền thì
đằng nào cũng bị thay bằng trắng, nên ảnh ra hoàn toàn đúng. Cờ giờ chỉ bật khi **người**
thật sự chạm mép ảnh (`analyze.edgeTouch`), không bật khi khung vượt ra vùng nền.

**4. Đỉnh đầu phải lấy từ mask, không lấy từ landmark.**
MediaPipe chỉ cho tới chân tóc. Ảnh thẻ bắt buộc căn theo đỉnh tóc thật, nên `findHeadTop()`
quét mask từ trên xuống trong dải ngang quanh khuôn mặt.

### Chọn model

| Model | License | Kích thước | Ghi chú |
|---|---|---|---|
| **MODNet** (mặc định) | Apache-2.0 | 25MB | Chuyên chân dung, giữ sợi tóc. Cân bằng tốt nhất. |
| MODNet (nén 8-bit) | Apache-2.0 | 7MB | Cho máy yếu / mạng chậm. |
| BiRefNet-lite | MIT | 224MB (CPU) | Chất lượng cao nhất nhưng rất nặng và hay lỗi GPU. Chỉ để đối chiếu. |

RMBG-1.4 / RMBG-2.0 bị loại dù chất lượng tốt: **license phi thương mại**, sẽ vướng nếu sau này
đưa cho trường khác dùng.

## Phím tắt

| Phím | Việc |
|---|---|
| `J` / `↓` · `K` / `↑` | Ảnh kế tiếp / ảnh trước |
| `Home` / `End` | Ảnh đầu / ảnh cuối |
| `Enter` | Mở cửa sổ chi tiết |
| `D` | Tải ảnh đang chọn |
| `X` | Loại / đưa lại vào kết quả |
| `Ctrl+Z` | Hoàn tác việc vừa làm |
| `Z` | Bật/tắt kính lúp soi viền |
| `B` | Thu gọn / mở thanh bên |
| `1` `2` `3` | Cỡ thẻ nhỏ / vừa / lớn |
| `Esc` | Đóng cửa sổ đang mở |
| `?` | Bảng phím tắt |

Phím tắt tự tắt khi con trỏ đang ở trong ô nhập liệu.

## Hoàn tác thay vì hỏi

Hành động đảo ngược được (loại ảnh khỏi kết quả) **không hỏi** — làm ngay rồi hiện dải
"Hoàn tác" trong 8 giây. Hỏi nhiều quá thì người dùng bấm đồng ý theo phản xạ, đến lúc cần
đọc thì đã bấm mất rồi.

Hành động mất dữ liệu thật (`Xoá hết`, `Xoá kích thước riêng`) thì **vừa hỏi vừa cho hoàn tác**:
objectURL của ảnh đã xoá chỉ được thu hồi sau khi cửa sổ hoàn tác đóng lại.

## Kính lúp soi viền

Rê chuột lên ảnh kết quả sẽ hiện ô phóng to 190px. Hệ số phóng lấy đúng bằng
`độ phân giải thật / độ rộng đang hiển thị` (thường 2,1–2,4×) — cố tình **không** phóng quá
mức thật, vì phóng thêm chỉ ra ảnh mờ chứ không thêm chi tiết. Đây là cách duy nhất thấy được
lỗi ăn mất tóc mà không phải mở cửa sổ chi tiết từng em.

## Thuật toán cắt 3×4

Khung xuất 354×472px = đúng 3×4cm ở 300dpi.

```
top_y   = pixel cao nhất của mask trong dải quanh mặt   (đỉnh tóc thật)
chin_y  = landmark #152                                  (cằm)
eye_c   = trung điểm hai mắt
roll    = góc nghiêng đường nối hai mắt

head_h  = chin_y - top_y
scale   = (472 × HEAD_RATIO) / head_h        HEAD_RATIO mặc định 0,62
eye_y   = 472 × TOP_GAP + (eye_c.y - top_y) × scale    TOP_GAP mặc định 0,09

Phép biến đổi canvas: đưa eye_c về (177, eye_y), xoay -roll, thu phóng scale.
```

Nhờ neo theo **đỉnh đầu + chiều cao đầu**, cả lớp có đỉnh tóc và cỡ mặt trùng nhau — điều mà
cắt tay không bao giờ đạt được.

## Khử ám màu viền tóc

Sợi tóc bán trong suốt mang theo màu nền cũ (xanh bảng). Với `C` là màu ảnh gốc, `a` là alpha,
`BG` là màu nền cũ ước lượng, `TARGET` là nền mới:

```
C = a·F + (1-a)·BG        →        O = a·F + (1-a)·TARGET = C + (1-a)·(TARGET - BG)
```

`BG` lấy bằng trung bình các pixel chắc chắn là nền (`alpha < 12`). Bỏ bước này thì ảnh nào
cũng có quầng xanh quanh tóc.

## Cấu trúc mã

```
src/
  core/
    caps.ts       dò năng lực máy, chọn model/backend mặc định
    models.ts     danh mục model + license + kích thước
    face.ts       MediaPipe FaceLandmarker (main thread)
    worker.ts     tách nền bằng transformers.js (module worker)
    engine.ts     hàng đợi tuần tự tới worker
    analyze.ts    ghép landmark + mask -> Analysis (đỉnh đầu, màu nền, độ phủ)
    compose.ts    ghép nền mới + cắt 3x4 + nén JPEG + sinh cờ cảnh báo
    zip.ts        đóng gói ZIP (fflate, level 0 vì JPEG đã nén)
    types.ts
  ui/             Sidebar, Grid, Inspector
  store.ts        zustand + điều phối chạy lô + bộ dò WebGPU hỏng
```

Kết quả AI (`mask` + `landmarks`) được cache theo từng ảnh, nên đổi thông số cắt chỉ chạy lại
khâu ghép (~150ms/ảnh) chứ không chạy lại model.

`vite.config.ts` đặt `Cross-Origin-Opener-Policy: same-origin` +
`Cross-Origin-Embedder-Policy: credentialless` để bật `crossOriginIsolated`, nhờ đó
onnxruntime-web dùng được WASM đa luồng (nhanh gấp ~2 lần). `credentialless` thay vì
`require-corp` để vẫn tải được model từ HuggingFace và CDN.

## Chưa làm (các giai đoạn sau)

- **P1 còn lại** — phím tắt J/K/Space, slider so sánh trước-sau trong inspector
- **P2** — trình sửa từng ảnh: kéo/zoom/xoay khung, thanh sáng–tương phản–tông da, undo/redo
- **P3** — đường xử lý riêng cho ảnh scan giấy cũ: phát hiện nền phẳng → flood-fill thay vì AI,
  tự xoay thẳng, khử ố vàng
- **P4** — brush sửa mask thủ công, upscale AI cho ảnh thiếu pixel, PWA chạy offline,
  xuất tờ in ghép nhiều ảnh
