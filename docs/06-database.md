# 06 — Kiến trúc dữ liệu và hosting (100% miễn phí)

> Thay cho data model ở [02-technical-specs.md §3](./02-technical-specs.md#3-data-model-firestore) và các phần dùng Cloud Functions trong 02. Ràng buộc: **không gói trả phí, không thẻ thanh toán, chỉ các tính năng app gốc có.** Mọi con số free tier dưới đây cần kiểm tra lại trên trang giá chính thức trước khi triển khai.

## 1. Tổng quan

```mermaid
flowchart TB
  subgraph Git["GitHub repo (public)"]
    C[content/articles/*.json]
    CODE[Next.js app + scripts]
  end
  subgraph GA["GitHub Actions (free)"]
    PIPE[Pipeline nội dung (05)]
    NIGHT[daily.yml: counts, bài hẹn giờ, dọn khách]
  end
  subgraph CF["Cloudflare (free)"]
    PAGES[Pages: site tĩnh + JSON bài + chỉ mục tìm kiếm]
    PF[Pages Functions: proxy /__/auth]
    W[Worker: OAuth cho Sveltia CMS]
  end
  subgraph FB["Firebase Spark (free)"]
    AUTH[Auth: Anonymous + Google]
    FS[(Firestore: dữ liệu người dùng,<br/>bộ đếm, bình luận, bài gửi)]
  end
  C --> PIPE
  PIPE -->|deploy hook| PAGES
  NIGHT <--> FS
  NIGHT --> PAGES
  APP[App] --> PAGES
  APP --> PF --> AUTH
  APP <--> FS
  CMSU[Biên tập viên /cms] --> W --> Git
```

| Thành phần | Dịch vụ | Free tier (kiểm tra lại) | Vai trò |
|-----------|---------|--------------------------|---------|
| Site + nội dung | **Cloudflare Pages** | Băng thông và request tĩnh không giới hạn; 500 build/tháng; ≤ 20.000 file/site | Next.js `output: 'export'`, JSON bài, chỉ mục tìm kiếm |
| Hàm nhỏ | **Cloudflare Pages Functions / Workers** | 100.000 request/ngày | Proxy `/__/auth/*` (07); OAuth GitHub cho CMS |
| Đăng nhập | **Firebase Authentication**, gói Spark, **không** nâng cấp lên Identity Platform | Google + Anonymous miễn phí | 07 |
| Dữ liệu động | **Cloud Firestore**, gói Spark | ~50.000 đọc, 20.000 ghi, 20.000 xoá mỗi ngày; 1 GiB | Like, lưu, tiến độ, streak, bộ đếm, bình luận, bài người dùng gửi |
| CMS | **Sveltia CMS** (mã nguồn mở) | Miễn phí | Form sửa bài, commit thẳng vào repo |
| Tác vụ nền | **GitHub Actions** | Không giới hạn phút cho repo public | Pipeline (05), job hằng đêm bằng Firebase Admin SDK |
| Ảnh/video | Unsplash, Pexels, Wikimedia, NASA (hotlink) | Miễn phí, có ghi công | Không dùng Firebase Storage (cần Blaze) |
| Analytics | **Cloudflare Web Analytics** | Miễn phí, không cookie | Lượt xem |

**Không dùng:** Cloud Functions, Cloud Storage, BigQuery, dịch vụ tìm kiếm trả phí.

## 2. Nội dung tĩnh trong Git

### 2.1 Thư mục

Xem [05 §6.1](./05-content-pipeline.md#61-cấu-trúc-repo). Script `scripts/build-content.ts` đọc `content/` và sinh:

```
public/data/
├─ feed.json                 # danh sách bài đã xuất bản, đã sắp xếp (title, hook rút gọn, cover, category, counts)
├─ articles/<slug>.json      # bài đầy đủ, markup đã parse thành InlineNode[]
├─ categories.json
└─ search-index.json         # chỉ mục MiniSearch
```

### 2.2 Schema bài nguồn (`content/articles/<slug>.json`, file CMS sửa)

Nội dung lưu dạng **chuỗi markup** (05 §6.3) để sửa được trong form. Build parse markup sang `InlineNode[]` cho client.

```ts
type Lang = 'en' | 'vi';
type Localized<T> = { en: T; vi?: T };

interface ArticleSource {
  slug: string;
  status: 'draft' | 'review' | 'published' | 'unpublished';
  publishAt?: string;                        // ISO date; bắt buộc khi published
  previewUrl?: string;                       // do pipeline điền
  category: string;
  title: Localized<string>;
  hook: Localized<string>;                   // markup
  sections: Array<{
    heading_en?: string; heading_vi?: string;
    body_en: string; body_vi?: string;       // markup
  }>;
  keyPoint?: Localized<string>;              // markup
  applySteps?: Localized<string[]>;          // 3 phần tử
  references: Array<{ id: string; label: string; url: string }>;   // chip {id}
  cover: {
    type: 'image' | 'video'; url: string; poster?: string;
    provider: 'unsplash' | 'pexels' | 'wikimedia' | 'nasa' | 'source' | 'own';
    author: string; authorUrl?: string; license: string; sourceUrl?: string;
    unsplashDownloadLocation?: string;       // để gọi endpoint download khi xuất bản
  };
  coverCandidates?: ArticleSource['cover'][];   // do pipeline điền
  blurDataURL?: string; dominant?: string;   // do pipeline điền
  origin: {
    group: 1 | 2 | 3 | 4;                    // 05 §2
    sourceId?: string;                       // content/sources/<id>.json (nhóm 1–3)
    submissionId?: string;                   // nhóm 4 từ app
    license: 'CC-BY-4.0' | 'CC-BY-3.0' | 'CC-BY-SA-4.0' | 'CC-BY-ND-4.0' | 'PD' | 'Reader-CC-BY-4.0';
    authors: string[];
    originalTitle?: string; originalUrl?: string;
    changes: string[];                       // ["shortened", "divided into sections", "translated to Vietnamese"]
    permission?: string;                     // link bằng chứng được tác giả cho phép (nếu cần)
  };
  ai?: { fields: string[]; reviewed: boolean; model?: string };
  wordCount?: number;                        // do pipeline/validate tính
}
```

### 2.3 Schema client (`public/data/articles/<slug>.json`)

```ts
type InlineNode =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'italic'; v: string }
  | { t: 'hl'; v: string; color: 'yellow' | 'pink' | 'green' }
  | { t: 'cite'; v: string; refId: string };
type Rich = InlineNode[];

interface ArticleClient {
  slug: string; category: string; publishedAt: string;
  title: Localized<string>;
  hook: Localized<Rich>;
  sections: Array<{ heading?: Localized<string>; body: Localized<Rich> }>;
  keyPoint?: Localized<Rich>;
  applySteps?: Localized<string[]>;
  references: Array<{ id: string; label: string; url: string }>;
  cover: { type: 'image' | 'video'; url: string; poster?: string; blurDataURL: string; dominant: string; author: string; authorUrl?: string; license: string };
  attribution: string;                       // dòng ghi công đã dựng sẵn
  counts: { likes: number; saves: number; shares: number; comments: number };   // từ counts.json (đêm qua)
  readingMinutes: number;
}
```

### 2.4 Build, preview và xuất bản

- **Build** (Cloudflare Pages, chỉ khi `deploy.yml` gọi hook, xem 05 bước 8): `build-content.ts` lấy bài `published` có `publishAt` ≤ hôm nay **và** qua `validate`, rồi sinh `public/data/*`, trang tĩnh `/a/<slug>`, chỉ mục tìm kiếm.
- **Xếp feed** lúc build: mới hơn được ưu tiên, cộng điểm tương tác từ `counts.json`, đan xen các chủ đề.
- **Preview** (`/preview?slug=…`): trang client-side đọc `https://raw.githubusercontent.com/<owner>/Reader/main/content/articles/<slug>.json`, parse markup bằng cùng hàm của build, rồi hiển thị bằng component Cover/Details/Comments & Apply. Có `noindex`, không có link từ app. Repo public nên không cần token.
- **Tìm kiếm**: MiniSearch trên title EN/VI, hook, heading, category; chuẩn hoá bỏ dấu tiếng Việt ("thien kien" ra "thiên kiến").

## 3. Firestore (gói Spark): chỉ dữ liệu động

### 3.1 Collections

```ts
// users/{uid}
interface UserDoc {
  displayName: string | null; photoURL: string | null;
  isAnonymous: boolean;
  lang: Lang; timezone: string;
  streak: { current: number; longest: number; lastReadDate: string | null };
  stats: { articlesRead: number };
  createdAt: Timestamp; lastActiveAt: Timestamp;
}
```

| Path | Document ID | Fields | Phục vụ tính năng app gốc |
|------|-------------|--------|---------------------------|
| `users/{uid}/likes` | slug | `createdAt` | Nút tim |
| `users/{uid}/saves` | slug | `createdAt` | Nút bookmark, tab Saved trong Profile |
| `users/{uid}/progress` | slug | `lastSection, completed, completedAt, applyDone[3]` | Nhớ vị trí đọc; tick 3 bước Apply |
| `users/{uid}/readDays` | `YYYY-MM-DD` | `slugs: string[]` | Streak 🔥 |
| `counters/{slug}` | slug | `likes, saves, shares, comments` | Số đếm |
| `comments/{slug}/items/{id}` | auto | `uid, displayName, photoURL, text, lang, status, createdAt` | Bình luận |
| `submissions/{id}` | auto | `uid, title, hook, sections[], references[], coverUrl?, status, slug?, createdAt` | Nút **+** đăng bài cá nhân (05 bước 10) |
| `moderators/{uid}` | uid | `role` | Ẩn bình luận vi phạm; chỉ Admin SDK ghi |

Messages (chat) và Notifications: ở MVP chỉ có giao diện và empty state như app gốc, chưa có collection. Khi làm chat thật sẽ thêm `conversations` và `notifications`.

### 3.2 Logic trên client thay cho Cloud Functions

| Việc | Cách làm | Rules bảo vệ |
|------|----------|--------------|
| Like/save | Transaction: tạo/xoá `users/{uid}/likes/{slug}` + `counters/{slug}.likes ± 1` | Chỉ ±1, khớp với việc doc like tồn tại hay không (`existsAfter`) |
| Share | `counters/{slug}.shares + 1` | Chỉ +1 |
| Bình luận | Batch: tạo comment + `counters/{slug}.comments + 1` | Tài khoản Google; 1–500 ký tự |
| Streak | Client tính `nextStreak` (02 §4.4), batch ghi `users/{uid}.streak`, `readDays/{date}`, `progress/{slug}`, `stats` | Streak chỉ giữ nguyên, +1, hoặc về 1 |
| Gửi bài (+) | Tạo `submissions/{id}` với `status: pending` | Tài khoản Google; giới hạn độ dài |
| Gộp dữ liệu khách → Google, xoá tài khoản | 07 §3.2, §7 | Chỉ ghi/xoá dữ liệu của chính mình |

### 3.3 Job nền (GitHub Actions + Admin SDK)

| Job | Lịch | Việc |
|-----|------|------|
| `daily.yml` | 00:05 giờ Việt Nam | Đọc `counters/*` → `content/generated/counts.json`; gọi deploy hook (gồm cả bài hẹn giờ) |
| `daily.yml` (Chủ nhật) | Hằng tuần | Xoá khách không hoạt động > 60 ngày; dọn dữ liệu mồ côi |
| `submissions.yml` | Mỗi 6 giờ | Chuyển `submissions` pending thành draft trong repo; cập nhật trạng thái khi bài được đăng hoặc bị từ chối |
| `set-moderator.yml` | Chạy tay | Ghi `moderators/{uid}` |
| `backup.yml` | Hằng tuần | Export `users`, `counters`, `comments`, `submissions` ra JSON, lưu làm artifact của workflow (90 ngày); **không** commit dữ liệu người dùng vào repo public |

### 3.4 Ngân sách quota

Một phiên điển hình (đọc 5 bài, mở bình luận 1 lần, like 2 bài, đọc xong 1 bài):

| Thao tác | Đọc | Ghi |
|----------|----:|----:|
| Hồ sơ + streak lúc mở app | 1 | 0–1 |
| Trạng thái like/save của các bài đang xem | ~5–10 | 0 |
| Bộ đếm sống khi mở Details (5 bài) | 5 | 0 |
| Mở bình luận 1 bài (`get`, limit 20) | ~20 | 0 |
| Like 2 bài | 2 | 4 |
| Hoàn thành 1 bài | 1 | 3 |
| **Tổng** | **~35** | **~8** |

Khoảng **1.400 người dùng hoạt động/ngày** trước khi chạm trần 50.000 lượt đọc (trần ghi khoảng 2.500 người). Cách giữ trong quota:

- Feed và số đếm của feed lấy từ JSON tĩnh. Chỉ đọc bộ đếm sống khi mở Details.
- Bật offline persistence của Firestore (cache IndexedDB).
- Bình luận dùng `get()` có phân trang; `onSnapshot` chỉ khi tab bình luận đang mở.
- Khi Firestore trả `resource-exhausted`: đọc bài vẫn bình thường; like và bình luận tạm báo "thử lại sau".

### 3.5 Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() { return request.auth != null; }
    function isMe(uid) { return signedIn() && request.auth.uid == uid; }
    function isGoogle() { return signedIn() && request.auth.token.firebase.sign_in_provider == 'google.com'; }
    function isMod() { return signedIn() && exists(/databases/$(db)/documents/moderators/$(request.auth.uid)); }
    function onlyDelta(field, d) {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly([field])
        && request.resource.data[field] == resource.data[field] + d;
    }
    function myDoc(sub, slug) { return /databases/$(db)/documents/users/$(request.auth.uid)/$(sub)/$(slug); }

    match /users/{uid} {
      allow read, create, delete: if isMe(uid);
      allow update: if isMe(uid)
        && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['displayName', 'photoURL', 'isAnonymous', 'lang', 'timezone', 'streak', 'stats', 'lastActiveAt'])
        && (request.resource.data.streak.current == resource.data.streak.current
            || request.resource.data.streak.current == resource.data.streak.current + 1
            || request.resource.data.streak.current == 1);
      match /{sub}/{doc} {
        allow read, write: if isMe(uid) && sub in ['likes', 'saves', 'progress', 'readDays'];
      }
    }

    match /counters/{slug} {
      allow read: if true;
      allow create: if signedIn() && request.resource.data.keys().hasOnly(['likes', 'saves', 'shares', 'comments']);
      allow update: if signedIn() && (
           (onlyDelta('likes', 1)  && existsAfter(myDoc('likes', slug)))
        || (onlyDelta('likes', -1) && !existsAfter(myDoc('likes', slug)))
        || (onlyDelta('saves', 1)  && existsAfter(myDoc('saves', slug)))
        || (onlyDelta('saves', -1) && !existsAfter(myDoc('saves', slug)))
        || onlyDelta('shares', 1)
        || (isGoogle() && (onlyDelta('comments', 1) || onlyDelta('comments', -1))));
    }

    match /comments/{slug}/items/{id} {
      allow read: if resource.data.status == 'visible' || isMod();
      allow create: if isGoogle()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.status == 'visible'
        && request.resource.data.text is string
        && request.resource.data.text.size() >= 1 && request.resource.data.text.size() <= 500
        && request.resource.data.createdAt == request.time;
      allow update: if isMod() && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status']);
      allow delete: if (signedIn() && resource.data.uid == request.auth.uid) || isMod();
    }

    match /submissions/{id} {
      allow create: if isGoogle()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.status == 'pending'
        && request.resource.data.title.size() <= 120
        && request.resource.data.sections.size() <= 10;
      allow read: if signedIn() && resource.data.uid == request.auth.uid;
    }

    match /moderators/{uid} { allow read: if isMe(uid); }
  }
}
```

Rules được test bằng `@firebase/rules-unit-testing` trên Firestore Emulator trong GitHub Actions.

### 3.6 Index

| Truy vấn | Index |
|----------|-------|
| `comments/{slug}/items where status=='visible' orderBy createdAt desc` | `status ASC, createdAt DESC` |
| collection group `items where uid==X` (xoá tài khoản) | collection-group index trên `uid` |
| `submissions where status=='pending'` (job) | mặc định |

## 4. Môi trường

| Môi trường | Firebase | Cloudflare |
|------------|----------|------------|
| Local | Emulator Suite (Auth + Firestore) | `next dev`; preview đọc file local |
| Production | project `reader-prod` (Spark) | Pages project, deploy bằng hook |

Có thể thêm project `reader-dev` (Spark, miễn phí) nếu cần môi trường thử.

## 5. Quyền riêng tư

- Dữ liệu cá nhân chỉ nằm trong Firestore; repo public không chứa dữ liệu người dùng (backup lưu làm artifact riêng, không commit).
- Bài người dùng gửi qua nút + được `submissions.yml` commit vào repo public ở trạng thái `review` (chưa lên app), chỉ kèm tên hiển thị, không kèm email hay uid. Form gửi bài báo trước rằng bài sẽ công khai theo CC BY 4.0.
- Không gửi dữ liệu người dùng cho Gemini hay bên thứ ba.
