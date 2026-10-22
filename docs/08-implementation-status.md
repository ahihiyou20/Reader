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
