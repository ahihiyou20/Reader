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

- **Tự động mỗi ngày**: workflow `feeds.yml` đọc các nguồn RSS trong `content/feeds.json` (NASA, Our World in Data, The Conversation, Global Voices, Wikipedia, USGS, và các trang chỉ được tóm tắt như Psyche, Quanta, Knowable…), viết **tối đa 20 bài/ngày** và gom vào **một pull request** `bot/new-articles`. Merge = đăng; xoá file của bài nào trong pull request để bỏ bài đó. Sửa nguồn trong CMS → Cài đặt → Nguồn tự động.
- **Thêm nhanh**: Issues → New issue → **Thêm bài viết**, dán link (hoặc văn bản bạn tự viết). Bot mở pull request kèm link preview và trả lời ngay trong issue.
- **Cách bot đăng theo giấy phép**: nguồn mở (CC BY, CC BY-NC, public domain, CC BY-SA) → phỏng theo, có tiếng Việt; CC BY-ND → nguyên văn kèm tóm tắt tiếng Việt; trang còn bản quyền → Reader tự viết **bản tóm tắt ngắn + nút “Đọc bài gốc”**, không lưu văn bản gốc, trang có `noindex`. Reader là dự án cá nhân phi thương mại nên nhận được giấy phép NC.
- **Gemini** (`GEMINI_API_KEY`, gói miễn phí) viết bản tiếng Việt, KEY POINT, 3 bước Apply, highlight và bản tóm tắt. Không có key: bài nguồn mở vẫn được tạo (chỉ tiếng Anh), các feed tóm tắt bị bỏ qua. Chỉ gửi văn bản bài viết, không bao giờ gửi dữ liệu người dùng.
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
6. Authentication → Settings → Authorized domains: thêm tên miền site (ví dụ `reader-xtm.pages.dev`).

### 2. Google OAuth (One Tap và đăng nhập redirect)

Trong Google Cloud Console của cùng project → APIs & Services → Credentials → OAuth client (Web):

- Authorized JavaScript origins: `https://reader-xtm.pages.dev` và `http://localhost:3000`.
- Authorized redirect URIs: `https://reader-xtm.pages.dev/__/auth/handler`.

**Branding (Google Auth Platform → Branding), để publish app:**

| Mục | Điền |
|-----|------|
| App name | `Reader` (đúng tên hiện trên site) |
| User support email | email của bạn (chỉ hiện cho người đăng nhập) |
| App logo | `public/icons/logo-120.png` (120×120 PNG) |
| App home page | `https://reader-xtm.pages.dev/about` |
| Privacy policy | `https://reader-xtm.pages.dev/privacy` |
| Terms of service | `https://reader-xtm.pages.dev/terms` |
| Authorized domains | `reader-xtm.pages.dev` |
| Developer contact | email của bạn |

- **Xác minh tên miền**: Google Search Console → thêm property URL prefix `https://reader-xtm.pages.dev` → chọn **HTML tag** → chép giá trị `content="…"` vào biến GitHub `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` → chạy lại workflow **Deploy** → bấm Verify.
- **Data access**: chỉ thêm scope `openid`, `email`, `profile` (không phải scope nhạy cảm, nên không cần Google thẩm định bảo mật).
- **Audience**: chọn *External*. Nếu chỉ vài người bạn dùng, có thể để **Testing** và thêm email của họ vào *Test users* (tối đa 100); muốn ai cũng đăng nhập được thì bấm **Publish app**. Logo và tên app chỉ hiện trên màn hình đồng ý sau khi Google duyệt branding (thường vài ngày).

### 3. Cloudflare Pages

Site đang chạy ở **https://reader-xtm.pages.dev** (project `reader`, tải lên trực tiếp bằng Wrangler, không nối Git).

1. GitHub → Settings → Secrets and variables → Actions → thêm secret `CLOUDFLARE_API_TOKEN` (quyền *Cloudflare Pages: Edit*) và `CLOUDFLARE_ACCOUNT_ID`. Từ đó `deploy.yml` build trong GitHub Actions và tải lên mỗi khi site thật sự thay đổi.
2. Biến build (GitHub → *Variables*, vì build chạy trong Actions): `SITE_URL=https://reader-xtm.pages.dev`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = **`reader-xtm.pages.dev`** (không phải `*.firebaseapp.com`, để đăng nhập chạy trên Safari/PWA qua proxy `/__/auth`), `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, tùy chọn `NEXT_PUBLIC_CF_ANALYTICS_TOKEN`.
3. Cloudflare dashboard → Workers & Pages → `reader` → Settings → Variables: `FIREBASE_PROJECT_ID` (cho Pages Function `functions/__/auth/[[path]].ts`).
4. Deploy tay từ máy: `pnpm build && pnpm dlx wrangler@4.148.0 pages deploy out --project-name reader --branch main`.

Nếu muốn Cloudflare tự build từ Git thay vì Wrangler: tạo project mới nối repo (build `pnpm build`, output `out`, `NODE_VERSION=22`), tắt build tự động, tạo **Deploy hook** và lưu vào secret `CF_PAGES_DEPLOY_HOOK`.

### 4. Đăng nhập CMS bằng GitHub

1. Deploy Worker [`sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth) lên Cloudflare Workers (miễn phí).
2. Tạo GitHub OAuth App, callback URL trỏ về Worker.
3. Sửa `base_url` trong `public/cms/config.yml` (hiện là địa chỉ mẫu `https://sveltia-cms-auth.example.workers.dev`).

### 5. GitHub Actions

Settings → Secrets and variables → Actions:

| Tên | Loại | Dùng cho |
|-----|------|----------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | secret | Đồng bộ số đếm hằng đêm, dọn tài khoản khách, bài người dùng gửi, sao lưu, gán moderator |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secret | Tải site lên Cloudflare Pages (`deploy.yml`) |
| `CF_PAGES_DEPLOY_HOOK` | secret, thay thế | Chỉ khi project Pages nối Git |
| `BACKUP_PASSPHRASE` | secret | Mật khẩu mã hoá bản sao lưu hằng tuần (bắt buộc nếu muốn chạy `backup.yml`; thiếu thì job dừng chứ không tải bản rõ lên) |
| `GEMINI_API_KEY` | secret, nên có | Bản tiếng Việt, KEY POINT, Apply, highlight, bản tóm tắt cho bài tự động (không bao giờ gửi dữ liệu người dùng). Lấy miễn phí ở Google AI Studio |
| `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY` | secret, tùy chọn | Gợi ý ảnh bìa khi import |
| `GEMINI_MODEL`, `SITE_URL`, `CF_PAGES_PROJECT` | variable | Tên model Gemini, địa chỉ site, tên project Pages (mặc định `reader`) |
| `NEXT_PUBLIC_*` | variable | Cấu hình Firebase, OAuth, xác minh Google cho bản build (mục 3) |

Thêm: Settings → Actions → General → **Workflow permissions** → bật **Allow GitHub Actions to create and approve pull requests** (để bot mở pull request bài mới).

Không bao giờ commit dữ liệu người dùng hay bản sao lưu vào repo. Vì repo public nên **mọi người đăng nhập GitHub đều tải được artifact**: `backup.yml` mã hoá bản export bằng GPG (AES-256) với `BACKUP_PASSPHRASE` trước khi lưu thành artifact 90 ngày. Giải nén: `gpg -d firestore-backup.tar.gz.gpg | tar -xz`.

### 6. Sau khi chạy

- Đăng nhập Google một lần trên site, rồi chạy workflow **Set moderator** với email của bạn để có quyền ẩn bình luận.
- Bật branch protection cho `main` (cấm force-push và xoá).

## Làm việc với Claude Code

`.mcp.json` và `.claude/settings.json` bật sẵn hai MCP server cho mọi phiên:

- **codegraph**: đồ thị code để tra cứu và xem phạm vi ảnh hưởng trước khi sửa. Mỗi phiên, hook `SessionStart` (`.claude/hooks/session-start.sh`) tự cài bản ghim nếu thiếu, rồi tạo hoặc đồng bộ chỉ mục `.codegraph/` (không commit) ở chế độ nền.
- **context-mode**: giữ output lớn ngoài ngữ cảnh và tìm kiếm FTS5. Các hook của nó (`.claude/hooks/context-mode.sh`) gắn vào PreToolUse, PostToolUse, PreCompact, UserPromptSubmit, SessionStart và Stop.

Telemetry của codegraph bị tắt (`DO_NOT_TRACK=1`). Muốn tắt hook: `/hooks` trong Claude Code, hoặc xoá khối `hooks` trong `.claude/settings.json`.

## Cấu trúc

```
app/          trang Next.js (feed, /a/[slug], /preview, /about, /privacy, /terms)
components/   feed, reader (Details), engage (Comments & Apply), chrome, overlays
lib/          content model, backend (Firebase / demo), i18n, motion, search, streak
content/      bài viết JSON, nguồn đã import, danh mục
scripts/      build-content, build-sw, pipeline nội dung, công cụ dev
functions/    Cloudflare Pages Function (proxy /__/auth)
tests/        unit, rules, e2e
docs/         PRD, đặc tả kỹ thuật, style guide, pipeline, database, auth
```

## Giấy phép nội dung

Mỗi bài ghi rõ nguồn, tác giả, giấy phép và các thay đổi ở cuối phần Chi tiết. Bài adapt từ nguồn CC BY / CC BY-NC giữ giấy phép gốc; bài từ Wikipedia mang CC BY-SA 4.0 (OpenStax: CC BY-NC-SA 4.0); bài nguyên văn giữ CC BY-ND; bài tóm tắt nguồn có bản quyền chỉ chứa lời của Reader và link tới bài gốc; bài do Reader tự viết dùng CC BY 4.0. Ảnh bìa từ Unsplash theo Unsplash License, ghi tên tác giả.
