# ⚔ CỜ TAM QUỐC

**Trò chơi ba phe trên bàn cờ lục giác** — Thục (蜀) · Ngô (吳) · Ngụy (魏)
tranh thiên hạ, lấy hình học từ bàn cờ lịch sử *“Game of the Three Kingdoms”*
(Möllendorff, 1876) — tái dựng chính xác 135 điểm giao trên Wikimedia SVG.

> *Viết cho Phạm Hoàng Gia Bảo* 🎁

---

## 🚀 Chạy nhanh

**Chơi ngay trên web (không cần cài gì):**

> 🔗 **https://tien2114988.github.io/co-tam-quoc/**

Chạy tốt trên **điện thoại** (iPhone/Android, dọc & ngang): bàn cờ tự co theo
màn hình, ô chạm to cho ngón tay, panel phòng cuộn được, chụm 2 ngón để phóng
to bàn cờ nếu muốn chính xác hơn.

**Chơi offline (không cần cài gì):**

```bash
open index.html          # macOS — hoặc bấm đúp vào index.html
```

**Chơi online (3 người, nhiều tab / nhiều máy):**

- **Trên bản web (khuyến nghị):** dùng như trên — chọn **Chơi online 3 người** →
  **Tạo phòng** / **Vào phòng** bằng mã 4 ký tự. Không cần server riêng:
  tín hiệu đi qua broker MQTT công cộng (WSS) — xem mục *Giao thức online*.
- **Chạy local:** `node server.js` rồi mở http://localhost:8787
  (server tĩnh + WebSocket, zero dependency — mặc định tự chọn WS trên localhost).
  Muốn buộc một transport: thêm `?net=ws` hoặc `?net=mqtt` vào URL.

- Tab 1: chọn **Chơi online 3 người** → **Tạo phòng** → được mã phòng 4 ký tự
- Tab 2 (3): chọn **Chơi online 3 người** → nhập mã → **Vào phòng**
- Chủ phòng bấm **▶ Bắt đầu**. Ghế trống sẽ do máy điều khiển (chủ phòng chạy AI).

---

## 🎮 Chế độ chơi

| Chế độ | Mô tả |
|---|---|
| **1 người vs 2 máy** | Bạn cầm Thục, đối đầu Ngô & Ngụy do máy điều khiển |
| **2 người + 1 máy** | Thục & Ngô là người, Ngụy do máy |
| **3 người chơi chung** | Luân phiên trên một thiết bị (có màn hình chuyển lượt) |
| **Chơi online 3 người** | Phòng riêng bằng mã 4 ký tự, có chat |

**Độ khó của máy:** Dễ (sâu 2 nước, hay đi bừa) · Vừa (sâu 4) · Khó (sâu 9, hết giờ 2,2 giây)

**Tùy chọn:**
- 🔊 Âm thanh (hiệu ứng WebAudio tự tổng hợp: gỗ gõ, ăn quân, chiếu, trống loại phe, khải hoàn)
- ⚖️ **Luật trung lập** — phe thứ ba không thể chặn thế chiếu của phe khác (mặc định tắt)

---

## 📜 Luật chơi tóm tắt

### Bàn cờ & đi quân
- Bàn **lục giác**, mỗi phe một nửa bàn cờ kiểu tướng 9×5 (cung 3×3 ở góc).
- **3 nhánh sông hình Y** + **tam giác trung tâm** là nơi vượt giữa các phe;
  **3 miệng sông** (10 điểm liên tiếp) là đường biên chung.
- Quân đi trên các **chuỗi đường** (24 chuỗi dọc + 15 chuỗi ngang, có gãy):
  - **Xe** đi thẳng dọc chuỗi, dừng ở quân cản.
  - **Pháo** đi như Xe, **ăn phải nhảy qua đúng 1 quân làm màn**.
  - **Mã** đi “2 ô + 1 bước chéo”, bị chặn bởi ô đi đầu (n1).
  - **Cờ hiệu** (Quân kỳ — 火/風/旗) đi “3 ô + 1 bước chéo” hình chữ L lớn,
    chặn bởi n1, n2 (n3 ảo) — quân đặc biệt chỉ có ở bản gốc.
  - **Tốt** tiến thẳng tăng khoảng cách gốc; đi ngang được **ngay tại hàng 5
    của mình** hoặc **đã vào đất địch**.
  - **Sĩ** đi chéo trong cung · **Tượng** đi chéo 2 ô trong lãnh thổ (có mắt chặn) ·
    **Tướng** đi 1 ô trong cung.
- **Mặt đối:** hai tướng đứng trên cùng chuỗi cặp, giữa hai ông không có ai →
  nước đi để xảy ra mặt đối là **bất hợp pháp** (không có “tướng bay”).

### ⭐ Luật đặc trưng: bị chiếu bí → đại bại chuyển quân
Khi phe A **hết nước** lúc đến lượt (bị chiếu bí hoặc cờ bí):

1. **Toàn bộ quân của A (trừ Tướng) chuyển sang phe hưởng** —
   phe chiếu (chiếu bí) hoặc **người vừa đi** (cờ bí);
2. **Tướng A bị hạ**, quân hưởng lập tức **trèo lên ngai** (téléport vào ô tướng);
3. Phe A **loại khỏi trận**, lượt đi nhảy sang phe sống kế tiếp;
4. Còn ≤ 1 phe sống → **chiến thắng** (hòa nếu chạm giới hạn 600 nước).

Đó chính là quy tắc bạn yêu cầu: *“khi A bị chiếu tướng do B, toàn bộ quân của A
sẽ chuyển sang cho B”* — một mình nước đi đó đủ thay đổi cục diện Tam Quốc.

### Luật trung lập (tùy chọn)
Phe C được phép (hoặc không) ngăn cản cuộc chiếu giữa A và B — mô phỏng
“phe thứ ba chưa can thiệp”. Bật/tắt trong menu.

---

## 🕹️ Điều khiển

- **Bấm quân** của phe mình → hiện các **ô vàng** (đi thường) và **vòng đỏ** (ăn quân)
- **Bấm ô** để đi · bấm chỗ trống để bỏ chọn
- **↩ Hoàn** — rút lại cả vòng đi của máy (không có khi chơi online)
- **⟳ Ván mới** · **☰ Về menu** · **🔊** tắt/bật tiếng
- Ô **mặt đối / ô đích ăn tướng** không bao giờ được phép đi vào (engine tự chặn)

---

## 🧪 Test

```bash
node test/run.js      # gộp 3 bộ
# hoặc chạy lẻ:
node test/geom.js     # 35 asserts — hình học 135 điểm, chuỗi đường, lục giác
node test/engine.js   # 50 asserts — luật đi, chiếu bí → chuyển quân, undo, trung lập…
node test/ai.js       # 9 asserts  — AI trả nước hợp lệ, tốc độ, 3 máy đấu đến hết ván
```

Tất cả đều PASS. Test AI tự đấu 3 phe đến khi có người thắng (200–300 nước).

---

## 🗂️ Cấu trúc

```
index.html        màn hình menu + bàn cờ SVG
style.css         chủ đề Tam Quốc (mực, vàng, lửa)
js/board.js       hình học bàn cờ: 135 node, chuỗi đường, sông, cung, quân đặt đầu
js/engine.js      luật chơi: movegen, hợp lệ (tự kiểm + mặt đối + trung lập),
                  make/unmake, phân bại & chuyển quân, API Game cho UI/AI
js/ai.js          tìm kiếm alpha-beta + iterative deepening, 3 cấp độ
js/app.js         giao diện, hoạt ảnh, âm thanh WebAudio, chế độ chơi, hiệu ứng
js/net.js         client online: WS (local) + MQTT/WSS (deploy), giao thức JSON như nhau
js/vendor/mqtt.min.js  thư viện MQTT 3.1.1 (mqtt.js 5.3.5, bundle)
server.js         HTTP tĩnh + relay phòng chơi (zero dependency, WS tự viết)
test/             geom · engine · ai · run
research/board.svg bàn cờ lịch sử gốc (nguồn hình học)
```

### Giao thức online (JSON, 2 transport)
`create / join / start / move / chat / rematch / leave` — server chỉ là **relay
trung tính**: mỗi client tự chạy engine và kiểm tính hợp lệ của nước đi;
ghế trống do **chủ phòng** chạy AI rồi phát đi, nên chơi 1v1 hoặc 2v1 cũng được.

- **Local (`?net=ws`, mặc định trên localhost):** JSON thuần qua WebSocket
  tới `server.js`.
- **Deploy (`?net=mqtt`, mặc định khi mở từ GitHub Pages):** cùng JSON được
  gói thành packet **MQTT 3.1.1** đi qua WSS tới broker công cộng
  `broker.hivemq.com` — chủ phòng vẫn là relay (topic `cotamquoc/<MÃ>/in|out`);
  topic `.../alive` (retained + will) báo tồn tại phòng, will của khách tự
  giải phóng ghế khi mất mạng. Không cần máy chủ riêng, chạy được trên hosting
  tĩnh bất kỳ.

---

*Binh gia lắm mưu · Cờ trận lắm đường — chúc các trận đấu vui!* ⚔️
