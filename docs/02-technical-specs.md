# 02 — Technical Specifications

> Stack đã chốt: **Next.js PWA (static export) + Firebase gói Spark + Cloudflare Pages**, chạy **100% miễn phí** (không Cloud Functions, không Cloud Storage, không AI trả phí).
>
> **Thứ tự ưu tiên khi các tài liệu khác nhau:** [05](./05-content-pipeline.md) (nội dung), [06](./06-database.md) (dữ liệu và hosting) và [07](./07-auth.md) (đăng nhập) mới hơn tài liệu này. Gesture, motion, cấu trúc component và milestone M0–M8 ở đây vẫn giữ nguyên.

## 1. Tech stack

> Bảng dưới là **những gì đã được cài đặt thật** (cập nhật sau khi triển khai). Các thay đổi so với bản kế hoạch ban đầu được ghi ở cột "Ghi chú" và ở [08](./08-implementation-status.md).

| Lớp | Lựa chọn | Ghi chú |
|-----|----------|---------|
| Framework | **Next.js 15** (App Router, React 19, TypeScript strict), `output: 'export'` | Trang `/a/[slug]` được prerender lúc build (SEO, chia sẻ, đọc được khi tắt JS) |
| Styling | **Tailwind CSS v4** + CSS variables trong `app/globals.css` (style guide §7) | Phần lớn style là CSS port từ prototype đã duyệt |
| Animation & gesture | **Framer Motion** (chỉ `motionValue`, `animate`, `useTransform`) + **pointer events tự viết** (`components/feed/Feed.tsx`, `components/overlays/Layer.tsx`) | Không dùng `@use-gesture`. `components/Motion.tsx` gắn MotionValue thẳng vào DOM (không dùng `motion.div`/`LazyMotion`) để giữ bundle < 200 KB |
| Icon | **lucide-react** | |
| State UI | **Zustand 5** (`stores/ui.ts`, `stores/user.ts`) | Selector trả về object phải bọc `useShallow` |
| Data fetching | **Cache tự viết** trên `useSyncExternalStore` (`lib/data.ts`) cho JSON tĩnh; Firebase SDK cho dữ liệu người dùng | Bỏ TanStack Query để giảm ~13 KB |
| i18n | **Catalog tự viết** (`lib/i18n.ts`, `messages/en.json`, `messages/vi.json`, số nhiều `_one`/`_other`) | Không có prefix `/en`, `/vi`; đổi ngôn ngữ tức thì trên client, lưu `localStorage` + cookie `NEXT_LOCALE` |
| Hosting | **Cloudflare Pages** + Pages Function proxy `/__/auth/*` (`functions/__/auth/[[path]].ts`) | 06 §1 |
| Backend | **Firebase gói Spark**: Auth (Anonymous + Google), Firestore, App Check. Không dùng Functions/Storage | Nạp lười (dynamic import) sau lần vẽ đầu. Khi chưa cấu hình Firebase, app chạy **chế độ demo** với `lib/backend/local.ts` (lưu trong trình duyệt) |
| Tác vụ nền | **GitHub Actions** (import, kiểm tra PR, đồng bộ số đếm, submissions, backup, deploy) | Miễn phí cho repo public |
| Tìm kiếm | **MiniSearch** trên `public/data/search-index.json`, gập dấu tiếng Việt | Không cần server |
| AI (tùy chọn) | **Gemini API free tier**, chỉ chạy trong GitHub Actions, chỉ gợi ý cho biên tập viên | 05 §6 |
| PWA | **Service worker tự sinh** (`scripts/build-sw.ts` → `out/sw.js`) | Không dùng Serwist: precache shell, stale-while-revalidate cho bài, cache-first cho ảnh |
| Test | **Vitest** (unit + Security Rules trên emulator), **Playwright** (E2E, Chromium, viewport iPhone 13) | `pnpm test`, `pnpm test:rules`, `pnpm test:e2e` (cần `pnpm build` trước) |
| Lint/format | ESLint 9 (flat config, next) + Prettier | |
| Package manager | pnpm 10 | |

## 2. Cấu trúc thư mục

```
reader/
├─ app/
│  ├─ layout.tsx                 # font Inter (opsz), metadata, viewport, Cloudflare Web Analytics
│  ├─ page.tsx                   # Feed (SCR-01/02/03) — render <ReaderApp/>
│  ├─ a/[slug]/page.tsx          # Deep link + bài prerender (#seo) cho SEO/không JS
│  ├─ preview/                   # Xem trước bài từ GitHub/CMS (biên tập viên)
│  ├─ privacy/, terms/           # Trang pháp lý song ngữ
│  ├─ manifest.ts, robots.ts, sitemap.ts, not-found.tsx
│  └─ globals.css
├─ components/
│  ├─ ReaderApp.tsx              # Ghép feed, chrome, overlay, sheet
│  ├─ Motion.tsx                 # MDiv/MNav/MH2: gắn MotionValue vào style DOM
│  ├─ RichText.tsx, ActionButton.tsx, CoverMedia.tsx, icons.tsx, hooks.ts
│  ├─ feed/       Feed (pager 2 chiều), ArticlePage, CoverView, EndCard, nav.ts, useFeedList.ts
│  ├─ reader/     DetailsView (section focus/dim, header co lại, KEY POINT, dots)
│  ├─ engage/     EngageView (Apply steps, bình luận, CTA)
│  ├─ chrome/     TopBar (+ StreakBadge), BottomNav, LangMenu, Toast, Avatar, BigHeart
│  └─ overlays/   Layer (Panel/Sheet kéo để đóng), Explore, Search, Messages, Notifications,
│                 Profile, Create, Sheets (Login, Sources, DeleteAccount), ArticleCard
├─ lib/
│  ├─ content/    types, markup (parser), schema (zod), validate, transform, rank
│  ├─ backend/    types (interface Backend), firebase.ts, local.ts (demo), onetap.ts, index.ts
│  ├─ actions.ts  # like/save/share/comment/streak/đăng nhập… gọi backend + optimistic UI
│  ├─ data.ts     # cache JSON tĩnh + prefetch
│  ├─ i18n.ts, motion.ts, search.ts, streak.ts, format.ts, analytics.ts, env.ts
│  └─ server/     content.ts (đọc dữ liệu lúc build cho trang SSG)
├─ stores/        ui.ts, user.ts (Zustand)
├─ messages/      en.json, vi.json
├─ content/       articles/*.json, categories.json, sources/, raw/, backlog/, generated/ — xem 05, 06 §2
├─ public/        covers/ (webp tự host), icons/, cms/ (Sveltia CMS), _headers, _routes.json
├─ scripts/
│  ├─ build-content.ts           # content/ → public/data/*
│  ├─ build-sw.ts                # sinh out/sw.js
│  ├─ serve.mjs                  # server tĩnh có clean URL (pnpm start, E2E)
│  ├─ pipeline/                  # import, adapters, licenses, validate, submissions, daily, backup…
│  └─ dev/                       # make-icons.ts, picsum-cover.ts
├─ functions/     Cloudflare Pages Functions (proxy /__/auth)
├─ .github/workflows/  ci, validate, import, ai-suggest, deploy, daily, submissions, set-moderator, backup
├─ firestore.rules, firestore.indexes.json, firebase.json
└─ tests/         unit/, rules/, e2e/
```

## 3. Data model (Firestore)

> Bản đầy đủ và mới nhất của data model (nội dung tĩnh trong Git, Firestore gói Spark, bài người dùng gửi) nằm ở [06-database.md](./06-database.md). Mục này giữ bản tóm tắt ban đầu; khi hai nơi khác nhau, theo 06.

```ts
// lib/richtext.ts
export type Lang = 'en' | 'vi';
export type Localized<T> = Partial<Record<Lang, T>> & { en: T };

export type InlineNode =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'italic'; v: string }
  | { t: 'hl'; v: string; color: 'yellow' | 'pink' | 'green'; bold?: boolean; italic?: boolean }
  | { t: 'cite'; v: string; sourceId: string };   // "CNBC (2025)" → sources[sourceId]

export type RichText = InlineNode[][];            // mảng đoạn văn, mỗi đoạn là mảng inline
```

### `articles/{articleId}`
```ts
interface Article {
  id: string;
  slug: string;                       // 'smarter-decisions'
  category: CategoryId;               // 'psychology' | 'science' | 'economics' | 'society' | 'health' | 'productivity' | 'history' | 'technology'
  tags: string[];
  keywords: string[];                 // lowercase, bỏ dấu, dùng cho search (array-contains-any)
  cover: { type: 'image' | 'video'; url: string; poster?: string; blurDataURL: string; dominant: string };
  title: Localized<string>;
  sections: Array<{
    variant: 'hook' | 'body';
    heading?: Localized<string>;
    body: Localized<RichText>;
  }>;
  keyPoint: Localized<RichText>;
  sources: Array<{ id: string; label: string; publisher: string; year: number; url: string }>;
  applySteps: Localized<string[]>;    // đúng 3 phần tử
  wordCount: number;                  // bản en
  counts: { likes: number; saves: number; shares: number; comments: number };
  rank: number;                       // điểm sắp xếp feed (cập nhật bởi Function)
  status: 'draft' | 'published';
  publishedAt: Timestamp;
}
```

### `users/{uid}`
```ts
interface UserDoc {
  displayName: string;
  photoURL: string;
  lang: Lang;
  timezone: string;                   // 'Asia/Ho_Chi_Minh' (Intl.DateTimeFormat().resolvedOptions().timeZone)
  streak: { current: number; longest: number; lastReadDate: string | null }; // 'YYYY-MM-DD' theo timezone user
  stats: { articlesRead: number };
  waitlistCreate?: boolean;
  createdAt: Timestamp;
}
```

### Subcollections & collections khác
| Path | Fields | Ghi chú |
|------|--------|---------|
| `users/{uid}/likes/{articleId}` | `createdAt` | Tồn tại = đã like |
| `users/{uid}/saves/{articleId}` | `createdAt` | |
| `users/{uid}/progress/{articleId}` | `lastSectionIndex, completed, completedAt, applyDone: boolean[3]` | |
| `users/{uid}/readDays/{YYYY-MM-DD}` | `articles: string[]` | Dùng vẽ lịch streak ở Profile |
| `articles/{id}/comments/{commentId}` | `uid, displayName, photoURL, text, lang, likeCount, createdAt` | |
| `conversations/{id}` | `members[], lastMessage, updatedAt` | v1.1 |
| `users/{uid}/notifications/{id}` | `type, payload, read, createdAt` | v1.1 |
| `categories/{id}` | `name: Localized<string>, emoji, order, hasNew` | |

### Index
- `articles`: `status ASC, rank DESC` (feed); `status ASC, category ASC, rank DESC` (explore); `status ASC, keywords ARRAY_CONTAINS, rank DESC` (search).
- `comments`: `createdAt DESC`.

## 4. Luồng dữ liệu chính

### 4.1 Feed
- Lúc build, `scripts/build-content.ts` đọc `content/articles/*.json`, kiểm tra (`lib/content/validate.ts`) rồi sinh `public/data/feed.json` (thứ tự đã xếp), `articles/<slug>.json`, `categories.json`, `search-index.json`, `terms.json`.
- Thứ tự (`lib/content/rank.ts`): `score = 100 / (1 + tuổi_ngày / 14) + 8 · log10(1 + likes + 2·saves + 3·shares + 2·comments)`, số đếm lấy từ `content/generated/counts.json` (job hằng đêm đồng bộ từ Firestore); sau đó xen kẽ để hai bài liền nhau khác chủ đề.
- Trên client (`components/feed/useFeedList.ts`): lọc theo chủ đề đang chọn, đẩy bài đã đọc xong xuống cuối, đưa bài deep link (`/a/<slug>`) lên đầu. Danh sách giữ nguyên trong lúc đọc.
- Chỉ render 3 trang (trước, hiện tại, sau). Khi đổi bài, prefetch JSON bài +1, +2, −1 và ảnh bìa (`lib/data.ts`).

### 4.2 Interactions (like/save/share)
- `lib/actions.ts` cập nhật Zustand trước (optimistic), rồi gọi `Backend` (`lib/backend/firebase.ts` hoặc `local.ts`); lỗi thì hoàn tác và hiện toast.
- Firebase: một `writeBatch` tạo/xoá `users/{uid}/likes/{slug}` và `increment(±1)` vào `counters/{slug}`; Security Rules dùng `existsAfter` để chỉ cho phép ±1 khớp với tài liệu like/save (06 §3).
- Like/save cần đăng nhập Google (khách ẩn danh được mời đăng nhập); share chỉ cần ẩn danh. Số đếm hiển thị = số trong `feed.json` lúc build + số sống đọc khi mở Details (`loadLiveCounts`).

### 4.3 Comments
- Đọc trang đầu `comments/{slug}/items` theo `createdAt desc` khi mở view Comments & Apply; thích/ẩn/xoá bình luận theo Rules (06 §3).
- Tạo comment: batch gồm comment mới + `increment(1)` cho `counters/{slug}.comments`; text 1–500 ký tự, render text thuần.

### 4.4 Streak

Hàm thuần, test kỹ:
```ts
// lib/streak.ts
export function nextStreak(
  s: { current: number; longest: number; lastReadDate: string | null },
  today: string,                     // 'YYYY-MM-DD' theo timezone user
): { current: number; longest: number; lastReadDate: string; changed: boolean } {
  if (s.lastReadDate === today) return { ...s, lastReadDate: today, changed: false };
  const isConsecutive = s.lastReadDate !== null && diffDays(s.lastReadDate, today) === 1;
  const current = isConsecutive ? s.current + 1 : 1;
  return { current, longest: Math.max(s.longest, current), lastReadDate: today, changed: true };
}
```
- Trigger: sự kiện `article_complete` (FR-09) → **client** tính `today` theo timezone của thiết bị, chạy `nextStreak`, rồi ghi một batch gồm `users/{uid}.streak`, `readDays/{today}`, `progress/{slug}`, `stats.articlesRead`. Security Rules giới hạn mức thay đổi streak (06 §3.5). Không có Cloud Function.
- Hiển thị: nếu `lastReadDate` < hôm qua → header hiển thị 0 (streak đã mất) dù chưa ghi lại server.
- Khách: đăng nhập ẩn danh (Anonymous Auth) nên streak lưu trong Firestore giống người dùng Google. Khi nâng cấp lên Google, uid giữ nguyên; nếu tài khoản Google đã tồn tại thì client gộp dữ liệu (xem [07-auth.md](./07-auth.md) §3.2).

### 4.5 Tiến độ đọc & hoàn thành
- `DetailsView` theo dõi section focus (IntersectionObserver, xem CMP-09) → debounce 1s ghi `progress.lastSectionIndex`.
- Hoàn thành khi: KeyPointCard visible ≥ 40% liên tục 2s, **hoặc** tổng thời gian ở Details ≥ `0.6 * wordCount / 230` phút. Chỉ bắn 1 lần mỗi bài.

### 4.6 i18n
- Không có route theo ngôn ngữ. `lib/i18n.ts` chọn ngôn ngữ theo `localStorage['reader.lang']` → cookie `NEXT_LOCALE` → `navigator.language` → `en`.
- Đổi ngôn ngữ trong LangMenu chỉ đổi state Zustand: bài, view và section đang đọc được giữ nguyên (FR-21). Người đã đăng nhập được ghi `users/{uid}.lang`.
- Nội dung bài lấy `field[lang] ?? field.en`; nếu fallback thì gắn nhãn "EN only" và `lang="en"` cho đoạn đó.

### 4.7 Search
- `lib/search.ts`: MiniSearch nạp lười `search-index.json` khi mở panel; gập dấu (`normalize('NFD')`, bỏ dấu, `đ → d`) cho cả chỉ mục và truy vấn, khớp tiền tố + mờ (fuzzy) nhẹ, ưu tiên tiêu đề > thuật ngữ > nội dung.
- Thuật ngữ phổ biến (`terms.json`) lấy từ tag của các bài; lịch sử tìm kiếm lưu cục bộ.

## 5. Gesture & navigation state machine

Feed là **pager 2 chiều**:
- **Trục dọc (FeedPager)**: danh sách bài. Chỉ hoạt động khi `view === 'cover'`.
- **Trục ngang (ArticlePager)** trong mỗi bài: `cover (0) ⇄ details (1) ⇄ engage (2)`.

```
                ┌────────── swipe ← ──────────┐┌────────── swipe ← ─────────┐
   ↑/↓ đổi bài  │                             ▼│                            ▼
  ┌─────────┐   │   ┌─────────┐  swipe →  ┌─────────┐  swipe →  ┌───────────────┐
  │ article │───┘   │  COVER  │◀──────────│ DETAILS │◀──────────│ COMMENTS&APPLY│
  │  N ± 1  │◀─────▶│ view=0  │           │ view=1  │           │    view=2     │
  └─────────┘       └─────────┘           └─────────┘           └───────────────┘
                    tap title/hint ──▶     tap 💬/hint ──▶
                                           ↑/↓ = cuộn nội dung   ↑/↓ = cuộn trang
```

**Quy tắc gesture** (pointer events tự viết trong `components/feed/Feed.tsx`, theo skill `apple-design` và style guide §5):
1. **Khóa trục**: `axis: 'lock'` với ngưỡng 10px (hysteresis) — trục được chọn theo chuyển động đầu tiên, sau đó bám 1:1.
2. **Motion value, không React state**: offset gắn vào `useMotionValue` (`x` của ArticlePager, `y` của FeedPager) và render qua `style={{ transform }}`. Không `setState` mỗi frame.
3. **Ngắt được**: khi `pointerdown` trong lúc đang snap, gọi `.stop()` trên animation, đọc giá trị motion value hiện tại làm điểm bắt đầu kéo (không nhảy về target).
4. **Khi thả** (trục ngang và trục dọc ở cover):
   ```ts
   const v = state.velocity[axis] * state.direction[axis] * 1000;          // px/s
   const projected = current + project(v);                                  // §5.1 style guide
   let target = clamp(Math.round(-projected / pageSize), index - 1, index + 1);
   if (Math.abs(v) >= 500) target = index + (v < 0 ? 1 : -1);               // flick: quyết theo dấu vận tốc
   animate(mv, -target * pageSize, {
     ...(Math.abs(v) >= 500 ? spring.flick : spring.default),
     velocity: v,                                                           // velocity handoff
   });
   ```
   Chỉ cho phép đi tối đa ±1 trang mỗi lần thả.
5. **Biên** (bài đầu kéo xuống, view 0 kéo phải, view 2 kéo trái): áp dụng `rubberband(overshoot, pageSize)` thay vì offset thô.
6. Trục dọc ở `view === 'details' | 'engage'`: **không** bắt gesture; nội dung cuộn native (`overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y`) để giữ quán tính native iOS.
7. Gesture ngang trong Details chỉ nhận khi container không đang cuộn có quán tính (theo dõi `scroll` event trong 100ms gần nhất), tránh vuốt nhầm khi đang cuộn.
8. Khi đổi bài: reset `view = 'cover'` cho bài mới; bài cũ giữ `view` trong store để quay lại đúng chỗ.
9. Bàn phím: `↑/↓` đổi bài (chỉ ở cover), `←/→` đổi view, `L` like, `S` save — đổi trạng thái **tức thì, không animation**.
10. Virtualization: chỉ mount bài `N−1, N, N+1`; video chỉ play ở bài N và view cover/details (pause khi rời).
11. `prefers-reduced-motion`: vẫn bám 1:1 khi kéo; khi thả thì crossfade 150ms tới trang đích (đặt motion value ngay lập tức dưới lớp opacity), bỏ parallax.

**Store (Zustand)**
```ts
interface UIState {
  activeIndex: number;
  viewByArticle: Record<string, 0 | 1 | 2>;
  sectionByArticle: Record<string, number>;
  sheet: null | 'login' | 'sources' | 'messages' | 'create' | 'notifications' | 'lang';
  setView(articleId: string, v: 0 | 1 | 2): void;
  // …
}
```

## 6. Firestore Security Rules (phác thảo)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() { return request.auth != null; }
    function isMe(uid) { return signedIn() && request.auth.uid == uid; }
    function onlyCounter(field, delta) {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly(['counts'])
        && request.resource.data.counts.diff(resource.data.counts).affectedKeys().hasOnly([field])
        && request.resource.data.counts[field] == resource.data.counts[field] + delta;
    }

    match /articles/{id} {
      allow read: if resource.data.status == 'published';
      allow update: if (signedIn() && (onlyCounter('likes', 1) || onlyCounter('likes', -1)
                                    || onlyCounter('saves', 1) || onlyCounter('saves', -1)))
                    || onlyCounter('shares', 1);
      // Bản phác thảo cũ. Rules thật nằm ở firestore.rules (số đếm ở counters/{slug}, xem 06 §3).

      match /comments/{cid} {
        allow read: if true;
        allow create: if signedIn()
          && request.resource.data.uid == request.auth.uid
          && request.resource.data.text is string
          && request.resource.data.text.size() > 0 && request.resource.data.text.size() <= 500
          && request.resource.data.createdAt == request.time;
        allow delete: if signedIn() && resource.data.uid == request.auth.uid;
      }
    }

    match /users/{uid} {
      allow read: if isMe(uid);
      allow create: if isMe(uid);
      // streak & stats chỉ do Function ghi
      allow update: if isMe(uid) && request.resource.data.diff(resource.data).affectedKeys()
                      .hasOnly(['displayName', 'photoURL', 'lang', 'timezone', 'waitlistCreate']);
      match /{sub}/{doc} {
        allow read: if isMe(uid);
        allow write: if isMe(uid) && sub in ['likes', 'saves'];
        // progress, readDays: Function ghi; progress.applyDone: client được ghi
        allow update: if isMe(uid) && sub == 'progress'
                      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['applyDone', 'lastSectionIndex']);
      }
    }

    match /categories/{id} { allow read: if true; }
    match /config/{id}     { allow read: if true; }
  }
}
```
Bật **Firebase App Check** (reCAPTCHA Enterprise) để chặn spam counter `shares`.

## 7. Logic phía server

Không dùng Cloud Functions (cần gói Blaze). Logic được chia lại như sau (chi tiết ở 06 §3.2–3.3):

| Trước đây | Bây giờ |
|-----------|---------|
| `completeArticle` | Batch ghi trên client + Rules |
| `mergeGuest` | Gộp trên client (07 §3.2) |
| `onUserCreate` | Client tạo `users/{uid}` lần đầu |
| `onCommentCreate/Delete` | Batch trên client tăng/giảm `counters/{slug}.comments` |
| `recomputeRank` | Xếp feed lúc build, dùng `counts.json` do job đêm tạo ra |
| Dọn khách, thống kê câu hỏi, gán moderator | GitHub Actions + Admin SDK |

## 8. Media & hiệu năng

- Ảnh cover: hotlink từ Unsplash/Pexels/Wikimedia với tham số kích thước của từng CDN (Unsplash có `w`, `q`, `fm=webp`); `next/image` dùng `unoptimized` vì site tĩnh không có image optimizer; `placeholder` là `blurDataURL` sinh lúc build.
- Video cover: MP4 H.264 ≤ 2MB, 720p, 6–10s loop, kèm `poster`. Thuộc tính `muted autoPlay loop playsInline preload="metadata"`.
- Nền Details: tái dùng cùng element ảnh/video của Cover, áp `filter: blur(24px) brightness(0.6)` + `transform: scale(1.1)` (tránh viền mờ) — không tải lại media.
- Chỉ animate `transform`/`opacity`; `will-change: transform` chỉ trên 3 trang đang mount của pager (không đặt toàn cục).
- Nền Details blur 24px là blur **tĩnh** trên một layer riêng (`will-change: transform` để rasterize một lần); không animate bán kính blur này. Animate blur chỉ ≤ 20px.
- Không điều khiển transform của con qua CSS variable đặt ở cha (gây tính lại style cho mọi con mỗi frame).
- Dùng skill `animation-performance` khi profile một animation bị giật.
- Font Inter tự host qua `next/font/google` với `subsets: ['latin','vietnamese']`, `display: 'swap'`.
- Service worker: precache app shell; runtime cache `StaleWhileRevalidate` cho JSON bài, `CacheFirst` (max 60 entries, 7 ngày) cho ảnh; giữ 20 bài gần nhất cho offline.

## 9. Analytics

`lib/analytics.ts` bọc `logEvent` Firebase Analytics. Các event ở NFR-08, payload tối thiểu `{ articleId, lang, view, sectionIndex }`.

## 10. Lộ trình triển khai (milestones)

Mỗi milestone là một PR; **Definition of Done** chung: lint + typecheck + unit test pass, E2E của milestone pass trên viewport 390×844, không lỗi console, đã tự so sánh với screenshot/video tham chiếu, và (từ M1) đã thử gesture trên máy thật iOS + Android vì Playwright/emulation không tái hiện được cảm giác chạm.

Khi implement component có motion/gesture, dùng các skill đã cài: `apple-design` (gesture, spring, material), `animate` (quyết định có animate không, easing, duration), `animation-performance` (frame budget), `mobile-native` (baseline PWA), `emil-design-eng` (review chi tiết).

| M | Phạm vi | FR / CMP | DoD riêng |
|---|---------|----------|-----------|
| **M0** Scaffold | Next.js + Tailwind v4 + tokens (style guide §7), mobile-native baseline (style guide §8), motion tokens (§5.2), font Inter, i18n tự viết, Firebase client (nạp lười), service worker tự sinh, ESLint/Prettier, Vitest, Playwright, nội dung JSON local | — | `pnpm dev` chạy; trang `/` nền `#0B0B0F`; test mẫu pass |
| **M1** Feed + Cover | FeedPager dọc, CoverView (media nền, scrim, CoverTitle, ActionRail tĩnh), TopBar, BottomNav, dữ liệu từ seed local | FR-01, 02, 04, 24 · CMP-01, 04, 05, 07, 08, 14 | Vuốt dọc snap mượt giữa ≥ 3 bài seed; trông giống screenshot 2 |
| **M2** Details reader | ArticlePager ngang, DetailsView, RichText + InlineChip, ArticleSection focus/dim, KeyPointCard, SourceLine/Sheet, PageDots, ScrollDownButton, header thu gọn | FR-03, 05–08 · CMP-06, 09–13 | Trông giống screenshot 1 & video 0–8s; chip đúng màu; dots theo section |
| **M3** Firebase + interactions | Firestore thật, seed script, Like/Save/Share optimistic, formatCount, double-tap like | FR-10–13 · CMP-04–06 | Counter đổi đúng sau reload; Rules test (emulator) pass |
| **M4** Comments & Apply | CommentsApplyView gradient, ApplyCard, CommentList realtime, CommentInput, ExploreCTA | FR-14–18 · CMP-15–18 | Giống video 9–15s; 2 tab trình duyệt thấy comment realtime |
| **M5** Auth + Streak + Profile | Anonymous + Google Sign-In, LoginSheet, proxy `/__/auth`, streak batch trên client, StreakBadge animation, Profile | FR-09, 19, 20 · CMP-02, 23 · SCR-07 | Unit test `nextStreak` (cùng ngày, liền kề, cách ngày, đổi timezone); streak tăng khi đọc xong |
| **M6** i18n | Message catalog đầy đủ, LangSwitcher + dropdown, nội dung song ngữ, giữ vị trí khi đổi | FR-21 · CMP-03 | Đổi en↔vi không mất bài/section; giống dropdown trong video |
| **M7** Explore & Search | SCR-04, SCR-05, keywords normalize, recent searches | FR-22, 23 | Tìm "thien kien" ra bài có "thiên kiến" |
| **M8** Social shell + PWA polish | MessagesPanel, Create sheet, Notifications sheet, offline, reduced-motion, a11y audit, Lighthouse | FR-25–27 · NFR-01–07 | Lighthouse PWA pass, Performance ≥ 90 mobile, a11y ≥ 95 |

## 11. Kiểm thử

| Lệnh | Nội dung | Số test hiện có |
|------|----------|-----------------|
| `pnpm test` | Unit (Vitest): markup parser, validate bài, search (gập dấu), streak (cùng ngày, liền kề, cách ngày, đổi timezone), format | 42 |
| `pnpm test:rules` | Security Rules trên Firestore emulator (cần Java 21): like ±1 khớp tài liệu, streak chỉ +1 hoặc về 1, khách không bình luận được, comment > 500 ký tự bị chặn, chỉ moderator ẩn được bình luận… | 21 |
| `pnpm test:e2e` | Playwright (Chromium, viewport iPhone 13) trên `out/` qua `scripts/serve.mjs`: feed mở, phím mũi tên, vuốt bằng touch thật (CDP), like được nhớ sau reload, đổi sang tiếng Việt, tìm "black hole" rồi mở bài, deep link `/a/<slug>`, HTML prerender đọc được không cần JS, trang privacy/terms | 9 |

CI (`.github/workflows/ci.yml`) chạy lần lượt typecheck → lint → unit → rules → build → E2E.

## 12. Biến môi trường

Xem `.env.example`. Để trống khối Firebase thì app chạy **chế độ demo** (dữ liệu chỉ lưu trong trình duyệt).

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=       # tên miền site (Pages) để proxy /__/auth, xem 07 §2
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=         # App Check (reCAPTCHA v3)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=           # One Tap
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=   # thẻ xác minh Google Search Console (branding OAuth)
NEXT_PUBLIC_USE_EMULATORS=false
NEXT_PUBLIC_SITE_URL=https://reader-xtm.pages.dev
NEXT_PUBLIC_REPO=ahihiyou20/Reader      # /preview đọc bài nháp từ repo này
NEXT_PUBLIC_REPO_BRANCH=main
NEXT_PUBLIC_CF_ANALYTICS_TOKEN=         # Cloudflare Web Analytics (tùy chọn)

# Cloudflare Pages (biến môi trường của Pages Function):
FIREBASE_PROJECT_ID=                    # proxy /__/auth → <id>.firebaseapp.com

# Chỉ trong GitHub Actions secrets (không bao giờ ở client):
FIREBASE_SERVICE_ACCOUNT_JSON=          # job đêm, submissions, backup, set-moderator
CLOUDFLARE_API_TOKEN=, CLOUDFLARE_ACCOUNT_ID=   # deploy.yml tải out/ lên Pages bằng Wrangler
CF_PAGES_DEPLOY_HOOK=                   # thay thế, chỉ khi project Pages nối Git
BACKUP_PASSPHRASE=                      # mã hoá bản sao lưu (artifact của repo public ai cũng tải được)
GEMINI_API_KEY=                         # nên có: bài tự động hằng ngày, form Issue (05 bước 11–12); GEMINI_MODEL ở variables
UNSPLASH_ACCESS_KEY=, PEXELS_API_KEY=   # tùy chọn, tìm ảnh bìa khi import
```
