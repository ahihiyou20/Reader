# 08 — Trạng thái triển khai

> File này ghi lại phần đã làm và phần còn lại, để tiếp tục được sau khi phiên làm việc bị gián đoạn.

## Đã có

- **Khung dự án**: Next.js 15 (static export), Tailwind v4, TypeScript strict, ESLint, Prettier; i18n tự viết (`messages/en.json`, `messages/vi.json`).
- **Content model**: `lib/content/*` (types, markup parser, schema Zod, validate, transform, rank), `scripts/build-content.ts` sinh `public/data/*` (feed, bài, categories, search index MiniSearch, popular terms).
- **Tầng dữ liệu**: `lib/backend/firebase.ts` (Anonymous + Google, link/merge, One Tap, redirect, like/save/share/comment, streak, submissions, xoá tài khoản, xuất dữ liệu) và `lib/backend/local.ts` (chế độ demo khi chưa cấu hình Firebase).
- **Giao diện**: Feed 2 chiều (gesture, spring, rubber-band), Cover, Details, Comments & Apply, TopBar, BottomNav, LangMenu, Toast, panel Explore/Search/Messages/Notifications/Profile/Create, sheet Login/Sources/DeleteAccount, trang `/a/[slug]`, `/preview`, `/privacy`, `/terms`.
- **MCP**: `.mcp.json` cài 5 server tham chiếu (memory, sequential-thinking, fetch, git, filesystem).

## Đang làm / còn lại

1. Chạy thử và sửa giao diện so với prototype (Playwright, viewport 390×844).
2. Service worker (`scripts/build-sw.ts`), icon PWA.
3. Pipeline: `scripts/pipeline/*` (import adapters, licenses, normalize, select-window, cover, ai-suggest, validate + Issue, submissions, daily, set-moderator, backup).
4. Sveltia CMS (`public/cms`), Cloudflare Pages Function `functions/__/auth/[[path]].ts`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`.
5. GitHub Actions: ci, import, ai-suggest, validate, deploy, daily, submissions, set-moderator, backup.
6. Nội dung ra mắt (~30 bài EN + VI, ảnh bìa có ghi công).
7. Test: unit (Vitest), rules (emulator), E2E (Playwright).
8. Cập nhật docs 02/05/06/07 cho khớp với code; README hướng dẫn thiết lập.

## Ghi chú quyết định trong lúc làm

- **i18n**: không dùng next-intl và không có prefix `/en`, `/vi`; ngôn ngữ đổi tức thì trên client (giữ nguyên bài và section), lưu ở `localStorage` + cookie `NEXT_LOCALE`.
- **Chuyển view ngang**: dùng kiểu trượt cạnh nhau + mờ dần như prototype đã duyệt, thay cho parallax 0.3× (parallax làm hai view chồng chữ lên nhau).
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
