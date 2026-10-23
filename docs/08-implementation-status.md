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
- **MCP**: `.mcp.json` cài 5 server tham chiếu (memory, sequential-thinking, fetch, git, filesystem) cùng `codegraph` (đồ thị code) và `context-mode` (giữ dữ liệu lớn ngoài ngữ cảnh, tìm kiếm FTS5), bật mặc định qua `.claude/settings.json`; hook `SessionStart` tự cài, dựng chỉ mục codegraph và nối các hook của context-mode.

## Pipeline v2 và deploy (2026-10-23)

- **Bài tự động**: `content/feeds.json` (14 nguồn, 13 đang bật), `scripts/pipeline/feeds.ts` + `create.ts` + `compose.ts` + `gemini.ts`, workflow `feeds.yml` (06:17 giờ Việt Nam). Tối đa **20 bài/ngày**, gom vào một pull request `bot/new-articles`; merge = đăng. Đã chạy thử thật (không có Gemini key): 5 bài từ NASA, Our World in Data, Global Voices, Wikipedia, USGS; một bài The Conversation dài 2.460 từ bị bỏ vì vượt giới hạn nguyên văn 1.500 từ.
- **Form Issue** `.github/ISSUE_TEMPLATE/add-article.yml` + `issue-article.yml`: dán link hoặc văn bản → pull request kèm preview; chỉ owner/member/collaborator.
- **Content model**: nhận giấy phép NC (CC BY-NC, CC BY-NC-SA, CC BY-NC-ND) vì site phi thương mại; giấy phép quyết định nhóm; **nhóm 5** (tóm tắt + link, `license: Copyright`, ≤ 450 từ, không lưu văn bản gốc); trường `summary.vi` cho bài nhóm 3.
- **Giao diện**: nhãn "Tóm tắt của Reader · <nguồn>" và nút **Đọc bài gốc đầy đủ** cho nhóm 5; khung "Tóm tắt tiếng Việt" ở đầu bài nhóm 3 khi đọc tiếng Việt; `noindex` và loại khỏi sitemap cho nhóm 3 và 5.
- **Branding cho Google OAuth**: trang `/about` song ngữ (trang chủ app trên màn hình đồng ý), logo `public/icons/logo-120.png`, thẻ xác minh `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, checklist trong README §2.
- **Deploy**: project Cloudflare Pages `reader` → **https://reader-xtm.pages.dev**, tải lên bằng Wrangler; `deploy.yml` build trong Actions khi có secret `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`.
- **Sửa lỗi phát hiện khi soát**: ở tiếng Việt, hàng nút trên Cover rộng hơn màn hình 375px, chạm nút gợi ý làm cả bài lệch ngang 21px; nay `.article` và `.view` dùng `overflow: clip`, nhãn rút gọn "Vuốt xem chi tiết". Test E2E vuốt bị chập chờn (có từ trước): vuốt 40% chiều cao chỉ qua trang nhờ vận tốc, mà máy bận thì sự kiện nhấc tay đến trễ > 100 ms; test nay vuốt 60%.
- **Test**: 54 unit (thêm feed, giấy phép, highlight, form Issue, nhóm 5), 10 E2E.

## Firebase (2026-10-23)

Làm bằng service account `claude@reader-app-512514` (Owner) qua API, không qua console:

- **Project** Google Cloud `reader-app-512514` (số 427872189161) đã thêm Firebase, gói Spark. Đã bật API: Firebase, Firestore, Identity Toolkit, Firebase Rules, App Check, IAM, API Keys, Cloud Resource Manager.
- **Firestore** `(default)`, chế độ Native, vùng **`asia-southeast1`** (Singapore, gần người đọc Việt Nam nhất; không đổi được sau khi tạo), bật chống xoá. Đã deploy `firestore.rules` và `firestore.indexes.json`.
- **Web app** `Reader`: `apiKey=AIzaSyD7aHQ1QK7-2lQrK4DAadQnoG7R1dXAWpk`, `appId=1:427872189161:web:9bf2ffe3c95507b5234e78`, `projectId=reader-app-512514`. Các giá trị này công khai theo thiết kế của Firebase (nằm trong bundle JS).
- **Cloudflare Pages** `reader`: đã đặt `FIREBASE_PROJECT_ID=reader-app-512514` cho production và preview; có hiệu lực từ lần deploy tới.
- **Authentication**: Anonymous và Google đã bật (OAuth client Web tự tạo `427872189161-p1r7um1joia6jk05nssq6qbcv91tt6us`); authorized domains thêm `reader-xtm.pages.dev`.
- **Deploy**: `deploy.yml` có sẵn cấu hình web công khai làm giá trị mặc định (biến GitHub cùng tên ghi đè được), nên không cần đặt biến `NEXT_PUBLIC_FIREBASE_*`. CI và E2E vẫn build ở chế độ demo. Đã deploy tay bằng Wrangler; kiểm tra trên site thật: `/__/auth/handler` trả 200, đăng nhập khách tạo được uid, Firestore đọc/ghi 200, console không lỗi.
- **Còn thiếu cho đăng nhập Google**: OAuth client chưa có redirect URI `https://reader-xtm.pages.dev/__/auth/handler` (Google trả `redirect_uri_mismatch`), và chưa có origin cho One Tap. Không sửa được qua API.

## Việc cần người làm (không tự động được)

1. Hoàn tất Firebase (README §1–2):
   - Google Cloud → APIs & Services → Credentials → *Web client (auto created by Google Service)*: thêm Authorized JavaScript origins `https://reader-xtm.pages.dev`, `http://localhost:3000` và Authorized redirect URI `https://reader-xtm.pages.dev/__/auth/handler`. Thiếu bước này thì đăng nhập Google trên site lỗi `redirect_uri_mismatch`.
   - (Nên làm) reCAPTCHA v3 site key cho App Check → biến `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`.
   - Secret `FIREBASE_SERVICE_ACCOUNT_JSON`: nên tạo service account riêng (ví dụ `reader-actions`) chỉ với `roles/datastore.user` và `roles/firebaseauth.admin` (đủ cho các script: đọc/ghi Firestore, `listUsers`, xoá khách, gán moderator), thay vì dùng tài khoản Owner.
2. Deploy Worker `sveltia-cms-auth` và sửa `base_url` trong `public/cms/config.yml` (đang là địa chỉ mẫu).
3. Thêm secrets GitHub Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GEMINI_API_KEY` (cần cho bài tự động), `FIREBASE_SERVICE_ACCOUNT_JSON`, `BACKUP_PASSPHRASE` (tùy chọn `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`), biến `SITE_URL=https://reader-xtm.pages.dev`, và bật *Allow GitHub Actions to create and approve pull requests*.
4. Điền branding trên Google Auth Platform và xác minh tên miền (README §2).
5. Biên tập viên đọc lại 30 bài seed (nhất là bản tiếng Việt) rồi bỏ cờ `seed`.
6. Chọn giấy phép cho mã nguồn (repo chưa có file `LICENSE`).

## Chưa kiểm chứng được trong môi trường phát triển

- Đăng nhập Google thật (popup, redirect qua `/__/auth`, One Tap), App Check và các workflow cần secret: chỉ test được bằng emulator/chế độ demo.
- Phần do Gemini viết (dịch, tóm tắt nhóm 5, highlight) và hai workflow `feeds.yml`, `issue-article.yml` trên GitHub: môi trường phát triển không có `GEMINI_API_KEY`, nên mới chạy thử nhánh không có Gemini; logic ráp bài có unit test.
- Cảm giác gesture trên máy thật iOS/Android (E2E dùng touch giả lập qua DevTools).
- Lighthouse trên site đã deploy.

## Ghi chú quyết định trong lúc làm

- **i18n**: không dùng next-intl và không có prefix `/en`, `/vi`; ngôn ngữ đổi tức thì trên client (giữ nguyên bài và section), lưu ở `localStorage` + cookie `NEXT_LOCALE`.
- **Chuyển view ngang**: dùng kiểu trượt cạnh nhau + mờ dần như prototype đã duyệt, thay cho parallax 0.3× (parallax làm hai view chồng chữ lên nhau).
- **Sao lưu**: artifact của repo public tải được bởi mọi tài khoản GitHub, nên `backup.yml` mã hoá GPG trước khi tải lên và dừng nếu thiếu `BACKUP_PASSPHRASE`.
- **Giấy phép OpenStax**: metadata trong các repo `openstax/osbooks-*` (kiểm tra 2026-10-22) cho thấy phần lớn sách là **CC BY-NC-SA 4.0**, chỉ vài cuốn (Physics, Life Liberty and the Pursuit of Happiness) là CC BY 4.0. Từ 2026-10-23 pipeline nhận NC (site phi thương mại): sách CC BY-NC-SA vào nhóm 2.

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
