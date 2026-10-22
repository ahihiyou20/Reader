# 02 — Technical Specifications

> Stack đã chốt: **Next.js PWA (static export) + Firebase gói Spark + Cloudflare Pages**, chạy **100% miễn phí** (không Cloud Functions, không Cloud Storage, không AI trả phí).
>
> **Thứ tự ưu tiên khi các tài liệu khác nhau:** [05](./05-content-pipeline.md) (nội dung), [06](./06-database.md) (dữ liệu và hosting) và [07](./07-auth.md) (đăng nhập) mới hơn tài liệu này. Gesture, motion, cấu trúc component và milestone M0–M8 ở đây vẫn giữ nguyên.

## 1. Tech stack

| Lớp | Lựa chọn | Lý do |
|-----|----------|-------|
| Framework | **Next.js 15** (App Router, React 19, TypeScript strict), `output: 'export'` | Site tĩnh: trang `/a/[slug]` được prerender lúc build (SEO, chia sẻ), host miễn phí |
| Styling | **Tailwind CSS v4** + CSS variables (xem style guide §7) | Token tập trung, dễ chỉnh |
| Animation & gesture | **Framer Motion** (`motion`, `useMotionValue`, `animate`) + **@use-gesture/react** | Spring, drag có velocity, khóa trục |
| Icon | **lucide-react** | Khớp bộ icon app gốc |
| State UI | **Zustand** | Feed index, view hiện tại, ngôn ngữ, sheet mở |
| Data fetching | **TanStack Query v5**: JSON tĩnh (`/data/*.json`) cho bài; Firebase SDK cho dữ liệu người dùng | Cache, optimistic update |
| i18n | **next-intl** (chế độ static export, prefix `/en`, `/vi`) | Message catalog en/vi |
| Hosting | **Cloudflare Pages** + Pages Functions (proxy `/__/auth`) | Free tier không giới hạn băng thông (06 §1) |
| Backend | **Firebase gói Spark**: Auth (Anonymous + Google), Firestore. Không dùng Functions/Storage | Miễn phí, không cần thẻ |
| Tác vụ nền | **GitHub Actions** (import nội dung, kiểm tra PR, job hằng đêm bằng Admin SDK) | Miễn phí cho repo public |
| Tìm kiếm | **MiniSearch** trên chỉ mục JSON tĩnh | Không cần server |
| AI (tùy chọn) | **Gemini API free tier**, chỉ chạy trong GitHub Actions | 05 §6 |
| PWA | **Serwist** (`@serwist/next`) | Service worker, precache, runtime cache ảnh/bài |
| Test | **Vitest** + Testing Library (unit), **Playwright** (E2E, viewport 390×844, emulate iPhone 14) | |
| Lint/format | ESLint (next config) + Prettier | |
| Package manager | pnpm | |

## 2. Cấu trúc thư mục

```
reader/
├─ app/
│  ├─ [locale]/
│  │  ├─ layout.tsx              # font Inter, providers, TopBar, BottomNav
│  │  ├─ page.tsx                # Feed (SCR-01/02/03)
│  │  ├─ a/[slug]/page.tsx       # Deep link: feed bắt đầu từ bài slug
│  │  ├─ explore/page.tsx        # SCR-04
│  │  ├─ search/page.tsx         # SCR-05
│  │  ├─ profile/page.tsx        # SCR-07
│  │  └─ login/page.tsx          # SCR-08
│  ├─ api/og/[slug]/route.tsx    # Ảnh OG cho share
│  ├─ manifest.ts
│  └─ sw.ts                      # Serwist
├─ components/
│  ├─ primitives/   CircleIconButton, PillButton, Sheet, Toast, Skeleton
│  ├─ chrome/       TopBar, StreakBadge, LangSwitcher, BottomNav
│  ├─ feed/         FeedPager, ArticlePager, CoverView, ActionRail, CoverTitle, Background
│  ├─ reader/       DetailsView, ArticleSection, RichText, InlineChip, KeyPointCard,
│  │                SourceLine, SourceSheet, PageDots, ScrollDownButton, ActionRow
│  ├─ engage/       CommentsApplyView, ApplyCard, CommentList, CommentInput,
│  │                ExploreCTA
│  ├─ explore/      CategoryChips, ArticleGrid, SearchBox, SearchResults
│  └─ social/       MessagesPanel, LoginSheet, NotificationsSheet
├─ lib/
│  ├─ firebase/     client.ts, auth.ts, articles.ts, interactions.ts, comments.ts, users.ts
│  ├─ streak.ts     # hàm thuần tính streak (unit-test)
│  ├─ format.ts     # formatCount, readingTime
│  ├─ richtext.ts   # types + helper
│  └─ analytics.ts
├─ stores/          ui.ts (Zustand)
├─ messages/        en.json, vi.json
├─ content/seed/    *.json bài mẫu (xem 04-content-sample.md)
├─ scripts/         seed.ts (đẩy content/seed lên Firestore)
├─ functions/       Cloudflare Pages Functions (chỉ proxy /__/auth và OAuth cho CMS)
├─ content/         Nội dung bài (JSON) — xem 06 §2
├─ .github/workflows/  import, kiểm tra PR, job hằng đêm
├─ firestore.rules
├─ firestore.indexes.json
└─ tests/           unit/, e2e/
```

## 3. Data model (Firestore)

> Bản đầy đủ và mới nhất của data model (thêm nguồn bài, pipeline nội dung, bài luyện tập IELTS, từ vựng) nằm ở [06-database.md](./06-database.md). Mục này giữ bản tóm tắt ban đầu; khi hai nơi khác nhau, theo 06.

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
- `useInfiniteQuery(['feed', category])` → query `articles where status=='published' [and category==x] orderBy rank desc limit 10 startAfter(cursor)`.
- SSR trang đầu (2 bài) qua Firebase Admin trong Server Component để LCP nhanh; phần còn lại client-side.
- Prefetch: khi `activeIndex` đổi, `<link rel="preload">` ảnh cover bài +1, +2; với video tạo `<video preload="metadata">` ẩn.
- Thứ tự feed MVP: `rank = publishedAt score + 0.3 * log(likes+saves*2+shares*3)` (Cloud Function cập nhật mỗi giờ). Loại bài đã đọc xong (lọc client bằng `progress`).

### 4.2 Interactions (like/save/share)
```ts
// lib/firebase/interactions.ts
async function toggleLike(uid: string, articleId: string, liked: boolean) {
  await runTransaction(db, async (tx) => {
    const likeRef = doc(db, 'users', uid, 'likes', articleId);
    const artRef = doc(db, 'articles', articleId);
    const snap = await tx.get(likeRef);
    if (liked && !snap.exists()) {
      tx.set(likeRef, { createdAt: serverTimestamp() });
      tx.update(artRef, { 'counts.likes': increment(1) });
    } else if (!liked && snap.exists()) {
      tx.delete(likeRef);
      tx.update(artRef, { 'counts.likes': increment(-1) });
    }
  });
}
```
- UI dùng `useMutation` với `onMutate` cập nhật cache trước (optimistic), `onError` rollback + toast.
- Share: `navigator.share` → khi resolve gọi `increment(1)` cho `counts.shares` (không cần đăng nhập; Rules cho phép +1 shares công khai, có rate-limit qua App Check).

### 4.3 Comments
- `onSnapshot(query(collection(db,'articles',id,'comments'), orderBy('createdAt','desc'), limit(20)))`.
- Tạo comment: client `addDoc`; Function `onCommentCreate` tăng `counts.comments`, tạo notification (v1.1).
- Text: trim, 1–500 ký tự, render dạng text thuần (React tự escape).

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
- Route `app/[locale]` với `locale ∈ {en, vi}`; middleware next-intl đọc cookie `NEXT_LOCALE` → `Accept-Language` → mặc định `en`.
- Đổi ngôn ngữ trên header: `router.replace(pathname, { locale })` với `scroll: false`; Zustand giữ `activeArticleIndex`, `view`, `sectionIndex` nên vị trí được giữ (FR-21). Đồng thời ghi `users/{uid}.lang`.
- Nội dung bài lấy `field[locale] ?? field.en`; nếu fallback thì gắn tag "EN only".

### 4.7 Search
- Chuẩn hóa query: lowercase, bỏ dấu (`normalize('NFD').replace(/\p{Diacritic}/gu,'')`), tách token, lấy tối đa 10 token → `where('keywords','array-contains-any', tokens)`.
- Client chấm điểm lại (số token khớp, khớp ở title) rồi sắp xếp. Đủ cho MVP < 5.000 bài; khi lớn hơn chuyển sang Algolia/Typesense (extension Firebase).

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

**Quy tắc gesture** (dùng `useDrag` của @use-gesture, theo skill `apple-design` và style guide §5):
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
      // counts.comments do Cloud Function (Admin SDK) cập nhật

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
| **M0** Scaffold | Next.js + Tailwind v4 + tokens (style guide §7), mobile-native baseline (style guide §8), motion tokens (§5.2), font Inter, next-intl khung, Firebase client, Serwist, ESLint/Prettier, Vitest, Playwright, seed JSON local | — | `pnpm dev` chạy; trang `/en` nền `#0B0B0F`; test mẫu pass |
| **M1** Feed + Cover | FeedPager dọc, CoverView (media nền, scrim, CoverTitle, ActionRail tĩnh), TopBar, BottomNav, dữ liệu từ seed local | FR-01, 02, 04, 24 · CMP-01, 04, 05, 07, 08, 14 | Vuốt dọc snap mượt giữa ≥ 3 bài seed; trông giống screenshot 2 |
| **M2** Details reader | ArticlePager ngang, DetailsView, RichText + InlineChip, ArticleSection focus/dim, KeyPointCard, SourceLine/Sheet, PageDots, ScrollDownButton, header thu gọn | FR-03, 05–08 · CMP-06, 09–13 | Trông giống screenshot 1 & video 0–8s; chip đúng màu; dots theo section |
| **M3** Firebase + interactions | Firestore thật, seed script, Like/Save/Share optimistic, formatCount, double-tap like | FR-10–13 · CMP-04–06 | Counter đổi đúng sau reload; Rules test (emulator) pass |
| **M4** Comments & Apply | CommentsApplyView gradient, ApplyCard, CommentList realtime, CommentInput, ExploreCTA | FR-14–18 · CMP-15–18 | Giống video 9–15s; 2 tab trình duyệt thấy comment realtime |
| **M5** Auth + Streak + Profile | Anonymous + Google Sign-In, LoginSheet, proxy `/__/auth`, streak batch trên client, StreakBadge animation, Profile | FR-09, 19, 20 · CMP-02, 23 · SCR-07 | Unit test `nextStreak` (cùng ngày, liền kề, cách ngày, đổi timezone); streak tăng khi đọc xong |
| **M6** i18n | Message catalog đầy đủ, LangSwitcher + dropdown, nội dung song ngữ, giữ vị trí khi đổi | FR-21 · CMP-03 | Đổi en↔vi không mất bài/section; giống dropdown trong video |
| **M7** Explore & Search | SCR-04, SCR-05, keywords normalize, recent searches | FR-22, 23 | Tìm "thien kien" ra bài có "thiên kiến" |
| **M8** Social shell + PWA polish | MessagesPanel, Create sheet, Notifications sheet, offline, reduced-motion, a11y audit, Lighthouse | FR-25–27 · NFR-01–07 | Lighthouse PWA pass, Performance ≥ 90 mobile, a11y ≥ 95 |

## 11. Kiểm thử

- **Unit**: `nextStreak`, `formatCount`, `readingTime`, normalize search, RichText renderer (snapshot đúng class chip).
- **Rules**: `@firebase/rules-unit-testing` trên emulator: không thể tăng likes +2, streak không nhảy quá 1, khách không viết được bình luận, comment > 500 ký tự bị chặn.
- **E2E (Playwright, iPhone 14)**: vuốt dọc đổi bài (`page.mouse` drag), vuốt ngang qua 3 view, like → số tăng, đổi ngôn ngữ giữ section, viết comment (Auth emulator), streak tăng sau khi đọc tới KEY POINT.
- **Visual**: screenshot Playwright của SCR-01/02/03 lưu làm baseline sau khi đã duyệt so với ảnh tham chiếu.

## 12. Biến môi trường

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=         # One Tap
NEXT_PUBLIC_USE_EMULATORS=true        # dev
# Chỉ trong GitHub Actions secrets (không bao giờ ở client):
FIREBASE_SERVICE_ACCOUNT_JSON=        # job đêm, seed
GEMINI_API_KEY=                       # tùy chọn, 05 §6
CF_PAGES_DEPLOY_HOOK=                 # trigger build hằng ngày
```
