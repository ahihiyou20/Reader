# 07 — Đăng nhập và tài khoản (Google, 100% miễn phí)

> Thay cho FR-19 trong PRD. Chạy trên **Firebase Authentication gói Spark** (không nâng cấp lên Identity Platform) cùng site tĩnh trên Cloudflare Pages ([06](./06-database.md)). **Không dùng Cloud Functions** (cần gói Blaze), nên mọi logic tài khoản chạy trên client và được Security Rules bảo vệ; việc quản trị chạy bằng GitHub Actions.

## 1. Phương thức

| Phương thức | Giai đoạn | Chi phí | Ghi chú |
|-------------|-----------|---------|---------|
| **Khách** (Anonymous Auth) | MVP | 0 | Tự động, không có màn hình; có uid thật nên dữ liệu được lưu |
| **Google** | MVP, **bắt buộc** | 0 | `GoogleAuthProvider`, scope `openid email profile` |
| Google One Tap (Google Identity Services) | MVP, trên Android/Chrome | 0 | Lấy ID token rồi `signInWithCredential` |
| Email link | v1.1 | Gói Spark có giới hạn số email/ngày; kiểm tra trước | Cho người không dùng Google |

Không dùng đăng nhập bằng số điện thoại (SMS tốn phí) và không dùng mật khẩu.

## 2. Quyền theo trạng thái

| Hành động | Khách | Google |
|-----------|:-----:|:------:|
| Đọc bài, xem bình luận, tìm kiếm, đổi ngôn ngữ | ✅ | ✅ |
| Like, lưu bài, streak, tick bước Apply | ✅ (chỉ trên thiết bị này) | ✅ (mọi thiết bị) |
| Viết bình luận, gửi bài (+) | ❌ (mở LoginSheet) | ✅ |
| Ẩn bình luận (moderator) | ❌ | Khi có `moderators/{uid}` |
| Duyệt và xuất bản bài | Qua GitHub (quyền merge repo), không qua app | |

App miễn phí, nên đăng nhập chỉ để đồng bộ dữ liệu và chống spam, không mở khoá nội dung nào.

## 3. Luồng

### 3.1 Mở app lần đầu

1. App tải feed tĩnh ngay, không chờ Auth.
2. Song song: `onAuthStateChanged`. Nếu chưa có phiên thì `signInAnonymously()`.
3. Lần đầu có uid: client tạo `users/{uid}` với giá trị mặc định (`isAnonymous: true`, `streak: {current: 0, longest: 0, lastReadDate: null}`, `lang` theo trình duyệt, `timezone` từ `Intl`).

### 3.2 Nâng cấp khách lên Google

**Trường hợp A: tài khoản Google chưa từng dùng Reader** (phổ biến nhất)

- `linkWithPopup(user, provider)` hoặc `linkWithRedirect` (3.3). Uid giữ nguyên, dữ liệu còn nguyên.
- Client cập nhật `users/{uid}`: `isAnonymous: false`, `displayName`, `photoURL`.

**Trường hợp B: lỗi `auth/credential-already-in-use`** (tài khoản Google đã có dữ liệu từ thiết bị khác). Không có server, nên gộp trên client:

1. **Trước khi** đổi tài khoản, đọc toàn bộ dữ liệu khách vào bộ nhớ (likes, saves, progress, readDays, streak). Dữ liệu này nhỏ và phần lớn đã có trong cache offline.
2. Lưu tạm bản sao vào `localStorage` (khoá `reader.pendingMerge`), phòng khi trang bị tải lại giữa chừng (luồng redirect).
3. `signInWithCredential(GoogleAuthProvider.credentialFromError(err))` để vào tài khoản Google.
4. Ghi gộp vào uid Google bằng batch (tối đa 500 thao tác mỗi batch; chia nhiều batch nếu cần):
   - likes, saves: lấy hợp.
   - progress: lấy bản `completed` hoặc `lastParagraph` lớn hơn.
   - readDays: hợp các ngày; tính lại streak từ danh sách ngày bằng `nextStreak`.
   - counters: **không** cộng lại like trùng (chỉ tăng counter cho những like mới thật sự với tài khoản Google).
5. Xoá `pendingMerge`. Dữ liệu và user khách cũ được job đêm dọn (06 §3.3); client không xoá được user khách sau khi đã rời phiên đó.
6. Toast: "Signed in as {name}. Your progress has been merged."

### 3.3 Popup hay redirect

| Môi trường | Cách đăng nhập | Lý do |
|------------|---------------|-------|
| Desktop browser | `signInWithPopup` / `linkWithPopup` | Không rời trang |
| Chrome Android, Chrome desktop | **Google One Tap** → `signInWithCredential(GoogleAuthProvider.credential(idToken))`; fallback popup | Một chạm |
| Safari iOS và **PWA standalone** | `signInWithRedirect` / `linkWithRedirect` + `getRedirectResult` khi tải lại | Popup trong chế độ standalone hay hỏng |
| In-app browser (Zalo, Facebook, TikTok…) | Hướng dẫn "Mở trong Safari/Chrome" + nút copy link | Google chặn OAuth trong webview (`disallowed_useragent`) |

### 3.4 Cho redirect hoạt động: proxy `/__/auth` trên Cloudflare (miễn phí)

Safari và Chrome chặn lưu trữ bên thứ ba, nên redirect chỉ ổn định khi `authDomain` **trùng domain của app**. Site chạy trên Cloudflare Pages, không phải Firebase Hosting, nên dùng một **Pages Function** proxy đường dẫn auth sang Firebase:

```ts
// functions/__/auth/[[path]].ts  (Cloudflare Pages Functions)
export const onRequest: PagesFunction<{ FIREBASE_PROJECT_ID: string }> = async ({ request, env }) => {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, `https://${env.FIREBASE_PROJECT_ID}.firebaseapp.com`);
  return fetch(new Request(target, request));
};
```

- Đặt biến môi trường `FIREBASE_PROJECT_ID` trong Cloudflare Pages (Settings → Environment variables). `public/_routes.json` giới hạn Function chỉ chạy cho `/__/auth/*`, các đường dẫn khác vẫn là file tĩnh.

- Đặt `authDomain` = domain của app (ví dụ `reader.pages.dev` hoặc domain riêng).
- Thêm `https://<domain>/__/auth/handler` vào **Authorized redirect URIs** của OAuth client (Google Cloud Console), và thêm domain vào **Authorized domains** (Firebase Auth).
- Mỗi lần đăng nhập chỉ tốn vài request, nằm trong quota 100.000 request/ngày miễn phí của Workers.

Domain: `*.pages.dev` miễn phí. Domain riêng tốn phí đăng ký (không bắt buộc).

## 4. Cấu hình (checklist, đều miễn phí)

1. Firebase Console (gói **Spark**) → Authentication → bật **Google** và **Anonymous**. **Không** bấm nâng cấp lên Identity Platform.
2. Google Cloud → OAuth consent screen:
   - External; tên "Reader"; email hỗ trợ; logo.
   - Link `/privacy` và `/terms` (trang tĩnh trong app).
   - Scopes chỉ `openid`, `email`, `profile` (không nhạy cảm, không phải thẩm định bảo mật).
   - Chuyển **In production**; nộp brand verification (miễn phí) để tên và logo hiện đúng.
3. OAuth Web client: JavaScript origins = domain prod + `http://localhost:3000`; redirect URI như 3.4.
4. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` cho One Tap.
5. **App Check** với reCAPTCHA v3 (có hạn mức miễn phí; kiểm tra quota hiện hành) để giảm spam ghi vào Firestore. Bật chế độ "monitor" trước, "enforce" sau khi ổn định.

## 5. Không có phiên phía server

Site là Next.js **static export**: không có SSR, middleware hay cookie phiên. Cá nhân hoá (bài đã lưu, streak) hiển thị trên client sau khi Auth sẵn sàng; trước đó hiện skeleton nhỏ. Không có trang quản trị nằm trong app; việc biên tập làm qua GitHub/Sveltia CMS (05 §4.4), và CMS đăng nhập bằng GitHub OAuth qua một Cloudflare Worker (miễn phí).

## 6. Moderator

- Danh sách moderator nằm trong `moderators/{uid}` (Firestore), do workflow GitHub Actions `set-moderator.yml` ghi bằng Admin SDK.
- Moderator thấy menu "Hide" trên mỗi bình luận; Rules kiểm tra `exists(moderators/{uid})`.

## 7. Hồ sơ, đăng xuất, xoá tài khoản

- **Profile**: avatar và tên từ Google (sửa được tên hiển thị), ngôn ngữ, streak, bài đã lưu, bài đã gửi và trạng thái.
- **Đăng xuất**: `signOut()`, rồi tự `signInAnonymously()` để tiếp tục đọc.
- **Xoá tài khoản** (có màn xác nhận ngay trong app):
  1. Hỏi: bình luận của bạn xoá luôn hay giữ dưới tên "Deleted user"?
  2. Client xoá các subcollection `users/{uid}/*` theo batch, xử lý bình luận theo lựa chọn (cần index `uid` trên collection group `items`), giảm counters tương ứng, rồi xoá `users/{uid}`.
  3. `user.delete()`. Nếu Firebase báo `auth/requires-recent-login`, gọi `reauthenticateWithPopup/Redirect` rồi chạy lại.
  4. Nếu bước nào lỗi giữa chừng, job đêm tìm dữ liệu mồ côi (uid không còn trong Auth) và xoá nốt.
- **Xuất dữ liệu**: client gom dữ liệu của chính mình thành file JSON để tải về (chạy trong trình duyệt, không cần server).

## 8. Quyền riêng tư

- Chỉ thu thập tên, email, ảnh từ Google và dữ liệu dùng app.
- Trang `/privacy` nêu mục đích, thời gian lưu, quyền xoá và xuất dữ liệu, theo Nghị định 13/2023/NĐ-CP và chính sách Google API User Data.
- Dưới nút đăng nhập có dòng đồng ý kèm link Privacy/Terms.
- Không gửi dữ liệu người dùng cho Gemini. Analytics dùng Cloudflare Web Analytics (không cookie).

## 9. UI (CMP-23 LoginSheet)

- Tiêu đề: "Save your progress" / "Lưu tiến độ của bạn".
- Mô tả: "Sign in to sync your streak and saved articles across devices, comment and share your own posts."
- Nút chính: "Continue with Google" (theo hướng dẫn thương hiệu Google). Nút phụ: "Not now".

| Mã / tình huống | Thông báo |
|-----------------|-----------|
| `auth/popup-closed-by-user`, `auth/cancelled-popup-request` | Không báo |
| `auth/popup-blocked` | Tự chuyển sang redirect |
| `auth/network-request-failed` | "No connection. Check your internet and try again." |
| `auth/credential-already-in-use` | Chạy luồng 3.2 B, hiện "Merging your progress…" |
| In-app browser | "Google sign-in doesn't work inside this app. Open Reader in Safari or Chrome." + nút copy link |
| `resource-exhausted` (hết quota Firestore trong ngày) | "Reader is busy right now. Your reading still works; try saving again later." |
| Khác | "Couldn't sign in. Try again." + mã lỗi nhỏ |

## 10. Kiểm thử (miễn phí)

- Firebase Emulator Suite (Auth + Firestore) chạy local và trong GitHub Actions; Playwright đăng nhập bằng tài khoản giả của emulator.
- Ca bắt buộc:
  1. Khách like 2 bài và có streak 1, rồi link Google: uid giữ nguyên, dữ liệu đủ.
  2. Thiết bị B đã có streak 5 với tài khoản Google; khách ở A đăng nhập cùng tài khoản: dữ liệu gộp đúng, counters không bị cộng trùng.
  3. Tải lại trang giữa luồng redirect: `pendingMerge` vẫn được gộp.
  4. Khách bị Rules từ chối khi viết bình luận.
  5. Xoá tài khoản thì không còn document nào dưới `users/{uid}`.
- Thử tay trên máy thật: iPhone (Safari và PWA standalone), Android Chrome (One Tap), in-app browser Zalo/Facebook.
