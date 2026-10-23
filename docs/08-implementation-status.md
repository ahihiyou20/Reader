# 08 — Trạng thái triển khai

> File này ghi lại phần đã làm, phần cần người làm tiếp và phần chưa kiểm chứng.

## Đã xong (2026-10-23)

- **Khung dự án**: Next.js 15 (static export), Tailwind v4, TypeScript strict, ESLint, Prettier; i18n tự viết (`messages/en.json`, `messages/vi.json`).
- **Content model**: `lib/content/*` (types, markup parser, schema Zod, validate, transform, rank), `scripts/build-content.ts` sinh `public/data/*` (feed, bài, categories, search index MiniSearch, popular terms).
- **Tầng dữ liệu**: `lib/backend/firebase.ts` (Anonymous + Google, link/merge, One Tap, redirect, like/save/share/comment, streak, submissions, xoá tài khoản, xuất dữ liệu) và `lib/backend/local.ts` (chế độ demo khi chưa cấu hình Firebase).
- **Giao diện**: Feed 2 chiều (gesture, spring, rubber-band), Cover, Details, Comments & Apply, TopBar, BottomNav, LangMenu, Toast, panel Explore/Search/Messages/Notifications/Profile/Create, sheet Login/Sources/DeleteAccount, trang `/a/[slug]`, `/preview`, `/privacy`, `/terms`, 404. Đã soát trên viewport 390×844 và 375×667 (EN + VI).
- **PWA**: `scripts/build-sw.ts` (precache 58 file, cache bài và ảnh), manifest, icon (`scripts/dev/make-icons.ts`).
- **Pipeline**: `scripts/pipeline/*` (import + adapters, bảng giấy phép, chọn đoạn, cover, Gemini tùy chọn, validate + Issue, submissions, daily, set-moderator, backup mã hoá, deploy-check). Sveltia CMS ghim 0.231.0 tại `/cms`.
- **Hạ tầng**: Pages Function proxy `/__/auth`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`, 9 workflow GitHub Actions.
- **Nội dung ra mắt**: **30 bài** song ngữ EN + VI, 8 chủ đề (science 7, economics 4, health 4, history 3, psychology 3, productivity 3, society 3, technology 3), mỗi bài 700–950 từ, 7 section, KEY POINT, 3 bước Apply, nguồn có DOI đã kiểm tra trên Crossref, ảnh bìa webp tự host có ghi công. Tất cả có cờ `seed: true`.
- **Test**: 42 unit, 21 Security Rules (emulator), 9 E2E (Playwright, `tests/e2e/reader.spec.ts`). Build, lint, typecheck sạch. JS tải lần đầu 190 KB.
- **Tài liệu**: README thiết lập (Firebase, OAuth, Cloudflare Pages, CMS auth, secrets); docs 02/05/06/07 cập nhật theo code.
- **MCP**: `.mcp.json` cài 5 server tham chiếu (memory, sequential-thinking, fetch, git, filesystem).

## Việc cần người làm (không tự động được)

1. Tạo project Firebase, OAuth client, project Cloudflare Pages và điền biến môi trường (README §Đưa lên mạng). Trước khi có, site chạy chế độ demo.
2. Deploy Worker `sveltia-cms-auth` và sửa `base_url` trong `public/cms/config.yml` (đang là địa chỉ mẫu).
3. Thêm secrets GitHub Actions: `FIREBASE_SERVICE_ACCOUNT_JSON`, `CF_PAGES_DEPLOY_HOOK`, `BACKUP_PASSPHRASE` (và tùy chọn `GEMINI_API_KEY`, `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`).
4. Biên tập viên đọc lại 30 bài seed (nhất là bản tiếng Việt) rồi bỏ cờ `seed`.
5. Chọn giấy phép cho mã nguồn (repo chưa có file `LICENSE`).

## Chưa kiểm chứng được trong môi trường phát triển

- Đăng nhập Google thật (popup, redirect qua `/__/auth`, One Tap), App Check và các workflow cần secret: chỉ test được bằng emulator/chế độ demo.
- Cảm giác gesture trên máy thật iOS/Android (E2E dùng touch giả lập qua DevTools).
- Lighthouse trên site đã deploy.

## Ghi chú quyết định trong lúc làm

- **i18n**: không dùng next-intl và không có prefix `/en`, `/vi`; ngôn ngữ đổi tức thì trên client (giữ nguyên bài và section), lưu ở `localStorage` + cookie `NEXT_LOCALE`.
- **Chuyển view ngang**: dùng kiểu trượt cạnh nhau + mờ dần như prototype đã duyệt, thay cho parallax 0.3× (parallax làm hai view chồng chữ lên nhau).
- **Sao lưu**: artifact của repo public tải được bởi mọi tài khoản GitHub, nên `backup.yml` mã hoá GPG trước khi tải lên và dừng nếu thiếu `BACKUP_PASSPHRASE`.
- **Giấy phép OpenStax**: metadata trong các repo `openstax/osbooks-*` (kiểm tra 2026-10-22) cho thấy phần lớn sách là **CC BY-NC-SA 4.0**, chỉ vài cuốn (Physics, Life Liberty and the Pursuit of Happiness) là CC BY 4.0. Pipeline từ chối NC theo mặc định.

## Phụ lục: ứng viên ảnh bìa (Unsplash qua picsum.photos)

`https://picsum.photos/v2/list` trả về ảnh Unsplash kèm tên tác giả và link gốc (giấy phép Unsplash License). Tải bản dọc: `https://picsum.photos/id/<id>/1080/1920`.

| Chủ đề | ID |
|--------|----|
| Quyết định, ngã rẽ | 473, 661, 563, 203, 255 |
| Điện thoại, lướt | 504, 816, 373 |
| Bầu trời đêm, giấc ngủ, vũ trụ | 681, 683, 825, 537, 724, 903, 974, 1022, 967 |
| Đại dương | 716, 700, 384, 1053, 909, 912, 881, 1069 |
| Cô đơn | 768, 680, 338, 259, 331 |
| Căng thẳng | 497, 978 |
| Đọc, học | 832, 444, 1073, 24, 367 |
| Thời gian, thói quen | 357, 175, 535 |
| Cà phê | 425, 766, 755, 431, 1060 |
| Ăn uống | 488, 292, 1080 |
| Vận động | 841, 839, 1077 |
| Năng lượng, công nghệ | 182, 403, 885, 486, 366 |
| Kinh tế, đô thị | 576, 382, 1078, 692, 348, 729, 955 |
| Địa chất, núi lửa | 523, 564, 1032, 829 |
| Lịch sử | 193, 1040, 819, 442 |
| Bạn bè, kết nối | 596, 390 |
