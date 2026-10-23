# Reader

Ứng dụng đọc kiểu TikTok: mỗi bài là một màn hình dọc, vuốt lên để sang bài mới, vuốt ngang để đọc chi tiết rồi bình luận và áp dụng. Bài viết song ngữ Anh–Việt, lấy từ nguồn có giấy phép mở (Our World in Data, Frontiers for Young Minds, NASA, CDC, NIST, Wikipedia…) hoặc do biên tập viên tự viết, luôn ghi công đầy đủ.

Chạy **100% miễn phí**: Next.js xuất tĩnh trên Cloudflare Pages, Firebase gói Spark (Auth + Firestore), GitHub Actions cho các tác vụ nền. Không dùng API AI trả phí; Gemini free tier là tùy chọn và chỉ gợi ý cho biên tập viên.

Tài liệu đầy đủ ở [`docs/`](./docs/README.md); trạng thái triển khai ở [`docs/08-implementation-status.md`](./docs/08-implementation-status.md).

## Chạy thử trên máy

Cần Node 22 và pnpm 10.

```bash
pnpm install
pnpm dev          # http://localhost:3000 — chế độ demo, không cần Firebase
```

Khi chưa điền khối Firebase trong `.env.local`, app chạy **chế độ demo**: like, lưu, streak, bình luận chỉ lưu trong trình duyệt và màn đăng nhập ghi rõ điều đó.

```bash
pnpm build        # sinh public/data từ content/, build Next.js ra out/, tạo out/sw.js
pnpm start        # phục vụ out/ tại http://localhost:4173 (clean URL như Cloudflare Pages)
```

## Kiểm thử

| Lệnh | Nội dung |
|------|----------|
| `pnpm typecheck`, `pnpm lint` | TypeScript strict, ESLint |
| `pnpm test` | Unit test (Vitest) |
| `pnpm test:rules` | Firestore Security Rules trên emulator (cần Java 21) |
| `pnpm test:e2e` | Playwright trên `out/`, viewport iPhone (chạy `pnpm build` trước) |
| `pnpm validate` | Kiểm tra mọi bài trong `content/articles` |

## Thêm và sửa bài

- **Bằng form**: mở `/cms` (Sveltia CMS) và đăng nhập bằng GitHub. Mỗi bài là một file JSON trong `content/articles/`; xem trước tại `/preview?slug=<slug>` trước khi xuất bản.
- **Import từ URL** (nguồn có trong bảng giấy phép `scripts/pipeline/licenses.ts`):
  ```bash
  pnpm tsx scripts/pipeline/import.ts --url <url> --category <id>
  ```
  Script lưu nguồn vào `content/sources/` và `content/raw/`, chọn đoạn 700–950 từ, chia section ≤ 130 từ và tạo bản nháp. Biên tập viên thêm highlight, KEY POINT, 3 bước Apply và bản tiếng Việt.
- **Ảnh bìa**: `pnpm tsx scripts/dev/picsum-cover.ts <slug> <picsum-id>` tải ảnh Unsplash (qua picsum.photos, không cần API key), nén webp ≤ 220 KB vào `public/covers/` và ghi tên tác giả vào bài.
- **Quy tắc nội dung**: xem [`docs/05-content-pipeline.md`](./docs/05-content-pipeline.md) (giấy phép, độ dài, markup `**đậm** *nghiêng* [y|p|g:highlight] {ref-id}`). Mọi DOI phải được kiểm tra trên Crossref.

30 bài ra mắt đều có cờ `"seed": true`: nội dung đã được soạn và kiểm tra nguồn, nhưng nên được một biên tập viên đọc lại rồi mới bỏ cờ.

## Đưa lên mạng (đều miễn phí)

### 1. Firebase (gói Spark)

1. Tạo project trên [Firebase Console](https://console.firebase.google.com/), **không** nâng cấp gói.
2. Authentication → bật **Google** và **Anonymous**.
3. Firestore → tạo database (chế độ production), rồi deploy rules và index:
   ```bash
   pnpm exec firebase login
   pnpm exec firebase deploy --only firestore --project <project-id>
   ```
4. (Nên làm) App Check → reCAPTCHA v3, lấy site key.
5. Project settings → thêm Web app, lấy `apiKey`, `appId`.
6. Authentication → Settings → Authorized domains: thêm tên miền site (ví dụ `reader.pages.dev`).

### 2. Google OAuth (One Tap và đăng nhập redirect)

Trong Google Cloud Console của cùng project → APIs & Services → Credentials → OAuth client (Web):

- Authorized JavaScript origins: `https://<tên-miền>` và `http://localhost:3000`.
- Authorized redirect URIs: `https://<tên-miền>/__/auth/handler`.

### 3. Cloudflare Pages

1. Tạo project Pages kết nối repo này. Build command `pnpm build`, output directory `out`, biến `NODE_VERSION=22`.
2. Environment variables (Production):
   - `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = **tên miền site** (không phải `*.firebaseapp.com`), để đăng nhập chạy được trên Safari/PWA qua proxy `/__/auth`
   - `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_SITE_URL`
   - `FIREBASE_PROJECT_ID` (cho Pages Function `functions/__/auth/[[path]].ts`)
   - tùy chọn `NEXT_PUBLIC_CF_ANALYTICS_TOKEN`
3. Tắt build tự động cho mỗi commit (Settings → Builds → Branch control) và tạo **Deploy hook**. Workflow `deploy.yml` chỉ gọi hook khi site thật sự thay đổi, để nằm trong quota 500 build/tháng.

### 4. Đăng nhập CMS bằng GitHub

1. Deploy Worker [`sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth) lên Cloudflare Workers (miễn phí).
2. Tạo GitHub OAuth App, callback URL trỏ về Worker.
3. Sửa `base_url` trong `public/cms/config.yml` (hiện là địa chỉ mẫu `https://sveltia-cms-auth.example.workers.dev`).

### 5. GitHub Actions

Settings → Secrets and variables → Actions:

| Tên | Loại | Dùng cho |
|-----|------|----------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | secret | Đồng bộ số đếm hằng đêm, dọn tài khoản khách, bài người dùng gửi, sao lưu, gán moderator |
| `CF_PAGES_DEPLOY_HOOK` | secret | Build lại site |
| `BACKUP_PASSPHRASE` | secret | Mật khẩu mã hoá bản sao lưu hằng tuần (bắt buộc nếu muốn chạy `backup.yml`; thiếu thì job dừng chứ không tải bản rõ lên) |
| `GEMINI_API_KEY` | secret, tùy chọn | Gợi ý bản dịch/KEY POINT cho biên tập viên (không bao giờ gửi dữ liệu người dùng) |
| `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY` | secret, tùy chọn | Gợi ý ảnh bìa khi import |
| `GEMINI_MODEL`, `SITE_URL` | variable | Tên model Gemini, địa chỉ site |

Không bao giờ commit dữ liệu người dùng hay bản sao lưu vào repo. Vì repo public nên **mọi người đăng nhập GitHub đều tải được artifact**: `backup.yml` mã hoá bản export bằng GPG (AES-256) với `BACKUP_PASSPHRASE` trước khi lưu thành artifact 90 ngày. Giải nén: `gpg -d firestore-backup.tar.gz.gpg | tar -xz`.

### 6. Sau khi chạy

- Đăng nhập Google một lần trên site, rồi chạy workflow **Set moderator** với email của bạn để có quyền ẩn bình luận.
- Bật branch protection cho `main` (cấm force-push và xoá).

## Cấu trúc

```
app/          trang Next.js (feed, /a/[slug], /preview, /privacy, /terms)
components/   feed, reader (Details), engage (Comments & Apply), chrome, overlays
lib/          content model, backend (Firebase / demo), i18n, motion, search, streak
content/      bài viết JSON, nguồn đã import, danh mục
scripts/      build-content, build-sw, pipeline nội dung, công cụ dev
functions/    Cloudflare Pages Function (proxy /__/auth)
tests/        unit, rules, e2e
docs/         PRD, đặc tả kỹ thuật, style guide, pipeline, database, auth
```

## Giấy phép nội dung

Mỗi bài ghi rõ nguồn, tác giả, giấy phép và các thay đổi ở cuối phần Chi tiết. Bài adapt từ nguồn CC BY giữ giấy phép gốc; bài từ Wikipedia mang CC BY-SA 4.0; bài do Reader tự viết dùng CC BY 4.0. Ảnh bìa từ Unsplash theo Unsplash License, ghi tên tác giả.
