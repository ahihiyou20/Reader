# Reader — Bộ tài liệu dự án

**Reader** là ứng dụng đọc bài viết tri thức ngắn theo phong cách TikTok: lướt dọc vô tận, nền ảnh/video sống động, mỗi bài chia thành các đoạn ngắn có highlight thuật ngữ, trích dẫn nguồn, thẻ **KEY POINT** và phần **Apply** để biến điều vừa đọc thành hành động.

Bộ tài liệu này là đầu vào để lập trình từng module. Giao diện bám sát app tham chiếu (2 screenshot + video 15 giây do user cung cấp), nhưng **không dùng tên, logo hay nhận diện thương hiệu của app gốc**.

## Thứ tự đọc

| # | File | Nội dung | Ai cần đọc |
|---|------|----------|------------|
| 1 | [01-product-requirements.md](./01-product-requirements.md) | PRD: mục tiêu, persona, phạm vi MVP, Functional Requirements (FR) kèm acceptance criteria, NFR, quy tắc nội dung | Tất cả |
| 2 | [03-ui-ux-style-guide.md](./03-ui-ux-style-guide.md) | Design tokens, typography, component specs (CMP), screen specs (SCR) với wireframe, motion, accessibility | Frontend, Design |
| 3 | [02-technical-specs.md](./02-technical-specs.md) | Stack, kiến trúc thư mục, data model Firestore, rich-text format, gesture state machine, streak, security rules, lộ trình milestone | Frontend, Backend |
| 4 | [04-content-sample.md](./04-content-sample.md) | Bài mẫu đầy đủ EN + VI, dạng JSON đúng schema, dùng làm seed & test fixture | Tất cả |
| 5 | [05-content-pipeline.md](./05-content-pipeline.md) | Nguồn bài có giấy phép mở, khuôn IELTS Reading, câu hỏi sinh theo quy tắc, Gemini free (tùy chọn), duyệt qua GitHub, lộ trình M9–M13 | Tất cả |
| 6 | [06-database.md](./06-database.md) | Kiến trúc 100% miễn phí: nội dung tĩnh trong Git + Cloudflare Pages, Firestore Spark cho dữ liệu người dùng, Rules, ngân sách quota | Backend, Frontend |
| 7 | [07-auth.md](./07-auth.md) | Khách ẩn danh + đăng nhập Google, gộp dữ liệu, cấu hình OAuth, phiên server, xoá tài khoản | Backend, Frontend |

## Quy ước ID

| Tiền tố | Ý nghĩa | Ví dụ |
|---------|---------|-------|
| `FR-xx` | Functional requirement | `FR-12` Like bài viết |
| `NFR-xx` | Non-functional requirement | `NFR-01` 60fps khi vuốt |
| `SCR-xx` | Màn hình / view | `SCR-02` Details view |
| `CMP-xx` | Component UI | `CMP-11` KeyPointCard |
| `M#` | Milestone triển khai | `M2` Details reader |

Mỗi FR tham chiếu đến SCR/CMP liên quan; mỗi CMP liệt kê FR mà nó phục vụ. Khi code, đặt ID vào tên test (`it('FR-12: like toggles…')`) để truy vết.

## Quyết định đã chốt

- **Nền tảng:** Next.js PWA mobile-first (cài lên màn hình chính iOS/Android), Firebase làm backend.
- **Tên app:** Reader.
- **Ngôn ngữ nội dung:** song ngữ Anh / Việt, chuyển ngay trên header.
- **Theme:** chỉ Dark mode ở MVP (giống app gốc).
- **Miễn phí hoàn toàn:** không paywall, không giới hạn bài đọc, bình luận hay bài luyện tập. Banner "Only 128/300 left" của app gốc đã bị bỏ.
- **Chi phí vận hành 0 đồng:** Cloudflare Pages + Firebase gói Spark + GitHub Actions; không Cloud Functions, không Claude API; AI chỉ là Gemini free tier và là tùy chọn.
- **Nội dung:** bài có giấy phép mở (OpenStax, Wikipedia, Our World in Data, Frontiers for Young Minds, eLife, NIH…) được adapt theo khuôn IELTS Academic Reading và được biên tập viên duyệt qua GitHub.
- **Đăng nhập:** khách ẩn danh tự động + Google.
- **Chuẩn motion & cảm giác native:** style guide §5 và §8 theo các skill của Emil Kowalski (`apple-design`, `animate`, `animation-performance`, `mobile-native`, `emil-design-eng`). Cài bằng `npx skills add https://github.com/emilkowalski/skills` và dùng chúng khi implement hoặc review component có gesture/animation.

## Nguồn tham chiếu hình ảnh

Mọi số đo trong style guide quy về khung tham chiếu **390 × 844 pt** (iPhone 14/15). Screenshot gốc có độ phân giải 924 × 2000 px (≈ 2.37×), video 720 × 1558 px.

Các khoảnh khắc chính trong video, theo thời gian:

| Thời điểm | Nội dung | Màn hình |
|-----------|----------|----------|
| 0–2s | Đoạn mở bài (hook) chữ lớn, H2 "The problem is not you, it is biology" mờ ở dưới | SCR-02 |
| 2–6s | Cuộn qua các section: Kahneman / System 1–2, PMC/NIH, Jeff Bezos one-way/two-way doors, Annie Duke | SCR-02 |
| 6–8s | Thẻ KEY POINT + dòng `[Source · 10]`, dot cuối active | SCR-02 |
| 8–9s | Mở panel Messages (empty state) | SCR-06 |
| 9–15s | Vuốt sang Comments & Apply (nền gradient hồng-tím), mở dropdown ngôn ngữ | SCR-03, CMP-03 |
