# 01 — Product Requirements Document (PRD)

> Phiên bản 1.0 · Sản phẩm: **Reader** · Nền tảng: Next.js PWA + Firebase

## 1. Tổng quan

### 1.1 Vision
Biến việc nạp kiến thức thành trải nghiệm "gây nghiện" như lướt TikTok: mỗi lần vuốt là một ý tưởng có giá trị — ngắn, trực quan, có nguồn rõ ràng — và luôn kết thúc bằng một hành động áp dụng được ngay.

### 1.2 Vấn đề
- Sách và blog dài khiến người bận rộn bỏ dở; video ngắn thì giải trí nhưng nông và thiếu nguồn.
- Người học muốn **chiều sâu** (tâm lý học, khoa học, kinh tế) ở **định dạng ngắn**, có **trích dẫn** để tin được, và có **bước áp dụng**.

### 1.3 Giải pháp
Bài viết ~400–600 từ, chia 5–7 section; mỗi section là một "trang" có ảnh/video nền. Thuật ngữ và số liệu được highlight, nguồn hiển thị inline. Cuối bài là thẻ KEY POINT; vuốt sang phải để bình luận và làm theo các bước Apply. Streak hằng ngày giữ thói quen.

### 1.4 Persona

| Persona | Mô tả | Nhu cầu chính |
|---------|-------|---------------|
| **Linh, 22, sinh viên ôn IELTS/SAT** | Đọc tiếng Anh học thuật mỗi ngày, hay lướt TikTok | Bài đọc kiểu Reading passage, chuyển nhanh EN ↔ VI để hiểu từ khó |
| **Minh, 29, nhân viên văn phòng** | Đọc trên tàu/xe, 10–15 phút | Ý tưởng tâm lý/năng suất áp dụng được ngay, không dài dòng |
| **Thảo, 35, quản lý** | Thích tóm tắt sách, nghiên cứu | Thông tin có nguồn, lưu bài để xem lại, chia sẻ cho team |

### 1.5 Chỉ số thành công (MVP, 8 tuần sau ra mắt)

| Chỉ số | Mục tiêu |
|--------|----------|
| D1 / D7 retention | ≥ 40% / ≥ 20% |
| Số section đọc trung bình mỗi phiên | ≥ 15 |
| Tỷ lệ đọc hết bài (tới KEY POINT) | ≥ 45% |
| User có streak ≥ 3 ngày | ≥ 25% số user active tuần |
| Tỷ lệ like / save trên lượt xem bài | ≥ 8% / ≥ 4% |

## 2. Phạm vi

| Hạng mục | MVP | v1.1 | Later |
|----------|:---:|:----:|:-----:|
| Feed lướt dọc (Cover view) | ✅ | | |
| Details reader: section, highlight, cite, KEY POINT, dots | ✅ | | |
| Like / Save / Share (Web Share API + copy link) | ✅ | | |
| Comments & Apply (vuốt ngang) | ✅ | | |
| Google Sign-In, hồ sơ cơ bản | ✅ | | |
| Streak 🔥 | ✅ | | |
| Song ngữ EN / VI | ✅ | | |
| Explore theo danh mục + Search từ khóa | ✅ | | |
| Messages panel (UI + empty state) | ✅ (UI) | Chat 1-1 thật | Nhóm thảo luận |
| Notifications (in-app list) | | ✅ | Web Push |
| Create post (+): soạn bài cá nhân | Nút hiển thị, mở "Coming soon" | Soạn & đăng bài | Kiểm duyệt cộng đồng |
| Banner "Founding member" (giới hạn suất) | ✅ | | |
| Light mode | | | ✅ |
| Quiz cuối bài, TTS đọc bài | | | ✅ |

## 3. Functional Requirements

Định dạng: **User story** → **Acceptance criteria** (Given / When / Then). Tham chiếu màn hình (SCR) và component (CMP) ở [03-ui-ux-style-guide.md](./03-ui-ux-style-guide.md).

### 3.1 Feed (SCR-01)

**FR-01 — Lướt dọc giữa các bài**
Là người đọc, tôi muốn vuốt lên/xuống để chuyển sang bài kế tiếp/trước đó.
- Given đang ở Cover view của bài N, When vuốt lên và điểm dừng dự đoán theo quán tính vượt quá nửa trang (hoặc vận tốc thả ≥ 500 px/s theo hướng lên), Then màn hình snap sang bài N+1 bằng spring nhận vận tốc của ngón tay (style guide §5).
- Trang bám 1:1 theo ngón tay trong khi kéo; user có thể bắt lại trang đang snap và kéo ngược mà không phải đợi animation xong.
- Given vuốt chưa đủ ngưỡng, When thả tay, Then trang bật về vị trí cũ.
- Given bài N là bài đầu, When vuốt xuống, Then có hiệu ứng rubber-band, không chuyển trang.
- Feed vô tận: khi còn ≤ 3 bài chưa xem trong bộ đệm, tự tải thêm trang tiếp theo (page size 10).

**FR-02 — Cover view của bài**
- Hiển thị ảnh hoặc video nền full-bleed (video: muted, autoplay, loop, playsInline), lớp gradient tối để chữ đọc được.
- Hiển thị tiêu đề lớn có nền highlight hồng mờ sau từng dòng chữ (CMP-08).
- Hiển thị ActionRail dọc bên phải: Like, Save, Share kèm số đếm (CMP-05).
- Hiển thị nút Grid (mở Explore dạng lưới), pill "Explore 🧭" (có chấm đỏ khi có danh mục mới) và gợi ý "Swipe to Details »".

**FR-03 — Mở Details**
- When vuốt sang trái trên Cover view **hoặc** chạm vào tiêu đề / gợi ý "Swipe to Details", Then chuyển sang Details view (SCR-02) bằng transition ngang.

**FR-04 — Prefetch**
- Ảnh/video nền và dữ liệu của bài N+1, N+2 được tải trước khi user đang ở bài N.

### 3.2 Article Reader — Details view (SCR-02)

**FR-05 — Hiển thị bài chia section**
- Header Details: pill "Details", gợi ý "Swipe to Comments & Apply »", tiêu đề nhỏ của bài, hàng 4 nút tròn ngang (Like, Save, Share, Comment) kèm số (CMP-06).
- Section đầu tiên là **hook** hiển thị cỡ chữ lớn (26/36). Các section sau có H2 tùy chọn + đoạn văn cỡ 19/30.
- Nền: ảnh/video cover làm mờ (blur 24px) và tối dần về phía dưới.

**FR-06 — Cuộn theo section, focus/dim**
- Nội dung cuộn dọc tự do; section đang nằm trong vùng đọc (≈ 20%–60% chiều cao viewport) hiển thị độ sáng 100%, các section khác mờ còn 35% (CMP-09).
- Nút tròn ⌄ (CMP-13) cuộn tới section kế tiếp; dot indicator hiển thị section hiện tại (số dot = số section, tối đa 9).
- Given đang ở section cuối, When cuộn tiếp xuống, Then **không** chuyển bài (tránh mất ngữ cảnh); user phải quay về Cover hoặc dùng feed để sang bài khác. *(Quyết định: trục dọc trong Details chỉ cuộn nội dung.)*

**FR-07 — Inline highlight & cite**
- Thuật ngữ quan trọng in đậm; thuật ngữ gốc/từ nước ngoài in nghiêng trong ngoặc.
- Cụm từ khóa có nền highlight bo góc theo màu ngữ nghĩa: vàng (sách/năm/tác giả), hồng (số liệu, khái niệm cần nhớ), xanh lá (kết luận/hướng đúng) (CMP-10).
- Trích dẫn nguồn hiển thị dạng chip xám inline, ví dụ `CNBC (2025)`, `PMC/NIH (2022)`. Chạm vào chip mở bottom sheet chi tiết nguồn (tên, năm, URL).

**FR-08 — Thẻ KEY POINT**
- Xuất hiện sau section cuối; khi thẻ vào viewport ≥ 40%, chạy animation slide-up + fade (300ms).
- Nội dung có thể chứa highlight và nghiêng (vd. *is this a one-way door or a two-way door?*).
- Dưới thẻ là dòng `[Source · N]` (N = số nguồn); chạm mở danh sách toàn bộ nguồn.

**FR-09 — Ghi nhận tiến độ đọc**
- Lưu `lastSectionIndex` theo bài (local + Firestore nếu đã đăng nhập).
- Bài được tính **hoàn thành** khi KEY POINT hiển thị ≥ 2 giây **hoặc** user đã ở Details ≥ 60% thời gian đọc ước tính (`wordCount / 230 wpm`). Sự kiện này kích hoạt FR-20 (streak).

### 3.3 Tương tác (CMP-05, CMP-06)

**FR-10 — Like**
- Chạm ♥: toggle like, icon đổi màu hồng neon (#FF3D8B) + animation burst; số đếm tăng/giảm ngay (optimistic). Double-tap vào vùng nội dung Cover cũng like (hiện trái tim lớn tại điểm chạm).
- Chưa đăng nhập: mở Login sheet (SCR-08); sau khi đăng nhập thì thực hiện like.

**FR-11 — Save / Bookmark**
- Toggle lưu bài; icon đổi màu vàng (#FACC15) khi đã lưu. Bài đã lưu xem được trong Profile (SCR-07) tab "Saved".

**FR-12 — Share**
- Dùng Web Share API (title + URL `/a/{slug}`); fallback: copy link + toast "Link copied". Mỗi lần share thành công tăng `counts.shares`.

**FR-13 — Định dạng số đếm**
- `< 1000` hiển thị nguyên; `1.2K`, `12K`, `1.2M`. Áp dụng cho mọi counter.

### 3.4 Comments & Apply (SCR-03)

**FR-14 — Mở Comments & Apply**
- When vuốt sang trái trên Details hoặc chạm nút 💬 / gợi ý "Swipe to Comments & Apply", Then chuyển sang SCR-03 với nền gradient hồng → tím → xanh. Vuốt phải để quay lại.

**FR-15 — Apply steps**
- Khối "Turn what you read into what you do": 3 bước hành động có checkbox; trạng thái tick lưu theo user. Khi tick đủ 3 bước, hiện confetti nhẹ và badge "Applied ✓" trên bài.

**FR-16 — Danh sách bình luận**
- Realtime (Firestore `onSnapshot`), sắp xếp mới nhất trước, phân trang 20. Empty state: icon + "No comments yet".
- Mỗi bình luận: avatar, tên, thời gian tương đối, nội dung, like bình luận.

**FR-17 — Viết bình luận**
- Ô "Write a comment" dạng pill; tối đa 500 ký tự; gửi bằng nút ➤ hoặc Enter. Chưa đăng nhập → Login sheet.
- Bình luận được hiển thị ngay (optimistic) và tăng `counts.comments`.

**FR-18 — Explore CTA & banner Founding member**
- Nút "Explore now ➜" (gradient) mở Explore (SCR-04).
- Banner "View comments from everyone! Only {remaining}/{total} left" với progress bar (đã dùng/total) và nút ✕ đóng (ẩn 7 ngày). Đây là ưu đãi Founding member: user đăng ký trong số suất giới hạn được gắn badge "Founding". Số suất đọc từ `config/founding`.

### 3.5 Auth & Profile (SCR-07, SCR-08)

**FR-19 — Google Sign-In**
- Đăng nhập bằng Google (Firebase Auth, popup trên desktop, redirect trên iOS PWA). Lần đầu tạo document `users/{uid}` với tên, avatar, `lang` mặc định theo trình duyệt.
- Không bắt buộc đăng nhập để đọc; bắt buộc để like/save/comment/streak đồng bộ.
- Header hiển thị avatar + tên (cắt "…" khi dài). Chạm avatar mở Profile: thống kê (streak hiện tại, dài nhất, số bài đã đọc), tab Saved / Liked, nút đăng xuất.

### 3.6 Streak (CMP-02)

**FR-20 — Tính streak**
- Một "ngày đọc" = có ≥ 1 bài hoàn thành (FR-09) trong ngày theo timezone của user.
- Ngày đọc đầu tiên: streak = 1. Đọc vào ngày liền kề sau `lastReadDate`: streak + 1. Đọc cùng ngày: không đổi. Bỏ ≥ 1 ngày: reset về 1 khi đọc lại.
- Khi streak tăng: icon 🔥 nảy (scale 1 → 1.3 → 1) và toast "🔥 {n}-day streak!".
- Header hiển thị 🔥 + số; nếu hôm nay chưa đọc, icon hiển thị grayscale 60%.
- Chưa đăng nhập: streak lưu localStorage, merge lên server khi đăng nhập (lấy giá trị lớn hơn).

### 3.7 Song ngữ (CMP-03)

**FR-21 — Chuyển ngôn ngữ nội dung & UI**
- Nút `en ⌄` / `vi ⌄` trên header mở dropdown: "🇻🇳 Tiếng Việt", "🇺🇸 English", dấu ✓ ở ngôn ngữ đang chọn.
- Chọn ngôn ngữ: toàn bộ UI string và nội dung bài đổi ngay, **giữ nguyên vị trí** (bài & section hiện tại). Lưu vào `users/{uid}.lang` và cookie `NEXT_LOCALE`.
- Nếu bài chưa có bản dịch ngôn ngữ đã chọn: hiển thị bản gốc kèm tag nhỏ "EN only".

### 3.8 Explore & Search (SCR-04, SCR-05)

**FR-22 — Explore theo danh mục**
- Nút 🧭 trên header, pill "Explore" và nút Grid mở SCR-04: chip danh mục (Psychology, Science, Economics, Society, Health, Productivity, History, Technology) + lưới thẻ bài (cover + tiêu đề).
- Chọn danh mục: lọc lưới; chạm thẻ bài: mở feed bắt đầu từ bài đó, feed tiếp tục trong danh mục đã chọn.

**FR-23 — Search**
- Nút 🔍 ở bottom bar mở SCR-05: ô tìm kiếm autofocus, lịch sử tìm kiếm gần đây (local, tối đa 10), gợi ý thuật ngữ phổ biến.
- Tìm theo tiêu đề, tags, thuật ngữ (field `keywords[]` đã chuẩn hóa không dấu, lowercase). Debounce 250ms. Kết quả dạng list có cover thumbnail.

### 3.9 Bottom bar, Create, Messages, Notifications

**FR-24 — Bottom navigation** (CMP-14): 3 nút tròn nổi 🔍 / ➕ / 💬, luôn hiển thị trên Cover & Details, ẩn trong SCR-03 (thay bằng input bình luận).

**FR-25 — Create post (+)**: MVP mở sheet "Coming soon — share your own insights" + nút "Notify me" (lưu `users/{uid}.waitlistCreate = true`). v1.1: trình soạn bài với section, highlight, nguồn.

**FR-26 — Messages panel** (SCR-06): slide-in từ phải, header pill "Messages ●" + icon bạn bè; MVP hiển thị empty state "No conversations yet".

**FR-27 — Notifications** (🔔 trên header): MVP icon hiển thị, chạm mở danh sách rỗng "You're all caught up". v1.1: thông báo reply bình luận, streak sắp mất (20:00 nếu hôm nay chưa đọc).

## 4. Non-functional Requirements

| ID | Yêu cầu |
|----|---------|
| NFR-01 | Gesture và transition đạt 60fps trên iPhone 12 / Pixel 6 (chỉ animate `transform`, `opacity`). |
| NFR-02 | LCP < 2.5s, INP < 200ms trên 4G mô phỏng; JS initial < 200KB gzip. |
| NFR-03 | PWA: cài được lên màn hình chính, chạy standalone, có splash, đọc offline các bài đã mở gần nhất (tối đa 20). |
| NFR-04 | Accessibility: tương phản chữ ≥ 4.5:1 (nhờ overlay), vùng chạm ≥ 44×44, hỗ trợ `prefers-reduced-motion`, các nút icon có `aria-label`, điều hướng bằng bàn phím (↑↓ đổi bài, ←→ đổi view). |
| NFR-05 | Bảo mật: Firestore Security Rules chặn ghi trái phép; counter chỉ thay đổi ±1 mỗi thao tác; nội dung bình luận được escape (không render HTML). |
| NFR-06 | i18n: không hard-code chuỗi UI; mọi chuỗi qua message catalog `en.json` / `vi.json`. |
| NFR-07 | Safe-area iOS: tôn trọng `env(safe-area-inset-*)` cho header và bottom bar. |
| NFR-08 | Analytics: log các sự kiện `article_view`, `section_view`, `article_complete`, `like`, `save`, `share`, `comment`, `streak_up`, `lang_switch`. |
| NFR-09 | Cảm giác native trên mobile: không chớp xám khi chạm, không hover dính, không zoom khi focus input, không pull-to-refresh, phản hồi nhấn ngay khi chạm xuống (style guide §8). Kiểm tra trên máy thật iOS + Android trước khi đóng milestone. |

## 5. Quy tắc nội dung (Content guidelines)

**Cấu trúc bài**
1. **Hook** (section 1): 50–80 từ, đặt câu hỏi/tình huống quen thuộc, kết bằng câu "twist".
2. **5–7 section thân bài**, mỗi section ≤ 90 từ, có thể mở bằng H2 ngắn (≤ 10 từ).
3. **KEY POINT**: 40–60 từ, dùng ẩn dụ đời thường + một câu hỏi/hành động.
4. **Sources**: 3–10 nguồn uy tín (báo chí lớn, PubMed/NIH, sách, báo cáo).
5. **Apply**: đúng 3 bước, mỗi bước bắt đầu bằng động từ, làm được trong ≤ 10 phút.

**Highlight**
- Tối đa 3 highlight màu mỗi section; không highlight cả câu dài > 8 từ.
- Vàng = tên sách/tác giả/năm/tổ chức; Hồng = số liệu, khái niệm trọng tâm; Xanh lá = hướng đi đúng/kết luận.
- **Đậm** cho thuật ngữ chính lần xuất hiện đầu; *nghiêng* cho thuật ngữ gốc trong ngoặc ở bản dịch.

**Citation**
- Mọi số liệu phải có chip nguồn `Tên (Năm)` ngay trong câu.

**Bản dịch**
- Bản VI dịch ý, giữ thuật ngữ tiếng Anh trong ngoặc nghiêng lần đầu, ví dụ: "thiên kiến xác nhận (*confirmation bias*)".
