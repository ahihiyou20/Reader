# 03 — UI/UX Style Guide & Design System

> Khung tham chiếu: **390 × 844 pt** (iPhone 14/15). Mọi kích thước dưới đây tính bằng CSS px trên khung này. Dark mode là theme duy nhất ở MVP.

## 1. Nguyên tắc thiết kế

1. **Immersive** — Nội dung chiếm toàn màn hình, nền ảnh/video luôn hiện diện (rõ ở Cover, mờ ở Details). Không có thanh điều hướng đặc, mọi control đều nổi.
2. **Content-first** — Chữ trắng, to, tương phản cao. Highlight chỉ dùng để dẫn mắt tới ý chính, không trang trí.
3. **One-thumb** — Mọi thao tác chính làm được bằng ngón cái: vuốt dọc/ngang, nút ở cạnh phải và đáy.
4. **Motion có mục đích** — Animation báo trạng thái (đã like, streak tăng, section đang đọc), dùng spring tự nhiên, tôn trọng reduced-motion.
5. **Glass & glow** — Bề mặt nổi dùng kính mờ tối; điểm nhấn dùng gradient hồng–tím phát sáng, dùng tiết kiệm (nút +, KEY POINT, CTA).
6. **Fluid như iOS** — Mọi thứ người dùng chạm được phải phản hồi ngay khi ngón tay chạm xuống, bám 1:1 theo ngón tay khi kéo, mang theo vận tốc khi thả, và có thể bị "bắt lại" giữa chừng. Chi tiết ở §5.
7. **Cảm giác như app cài đặt** — PWA không được lộ dấu hiệu "trang web trong trình duyệt" (chớp xám khi chạm, hover dính, trang bị zoom khi focus input, pull-to-refresh). Baseline ở §8.

> Các nguyên tắc ở §5–§8 dựa trên các skill `apple-design`, `animate`, `emil-design-eng`, `animation-performance` và `mobile-native` (bộ skill của Emil Kowalski). Khi implement component có motion hoặc gesture, gọi các skill này để đối chiếu.

## 2. Design tokens

### 2.1 Màu

| Token | Giá trị | Dùng cho |
|-------|---------|----------|
| `--bg-base` | `#0B0B0F` | Nền app, nền khi ảnh chưa tải |
| `--bg-elevated` | `#12121A` | Panel Messages, sheet |
| `--surface-glass` | `rgba(20, 20, 28, 0.55)` | Nút tròn, pill, bottom bar buttons |
| `--surface-glass-strong` | `rgba(24, 16, 28, 0.78)` | KeyPointCard, dropdown |
| `--stroke-glass` | `rgba(255, 255, 255, 0.10)` | Viền 1px của mọi bề mặt glass |
| `--text-primary` | `#FFFFFF` | Tiêu đề, đoạn đang focus |
| `--text-secondary` | `rgba(255, 255, 255, 0.72)` | Số đếm, gợi ý "Swipe to…" |
| `--text-tertiary` | `rgba(255, 255, 255, 0.50)` | Meta, `[Source · N]` |
| `--text-dimmed` | `rgba(255, 255, 255, 0.35)` | Section không focus |
| `--accent-pink` | `#FF3D8B` | Like active, chấm thông báo, gradient |
| `--accent-violet` | `#8B5CF6` | Gradient, focus ring |
| `--accent-fire` | `#FF7A1A` | Ngọn lửa streak |
| `--accent-keypoint` | `#FF8A3D` | Nhãn "KEY POINT" |
| `--accent-save` | `#FACC15` | Bookmark active |
| `--danger` | `#F43F5E` | Lỗi, recording |

**Highlight chips (inline)**

| Token | Nền | Chữ | Ngữ nghĩa |
|-------|-----|-----|-----------|
| `--hl-yellow` | `rgba(234, 179, 8, 0.35)` | `#FFFFFF` | Sách, tác giả, năm, tổ chức — "(2011)", "Jeff Bezos" |
| `--hl-pink` | `rgba(244, 63, 94, 0.30)` | `#FFFFFF` | Số liệu, khái niệm trọng tâm — "95% of everyday decisions", "learning to drive" |
| `--hl-green` | `rgba(34, 197, 94, 0.30)` | `#FFFFFF` | Kết luận, hướng đúng — "the second type" |
| `--hl-cite` | `rgba(255, 255, 255, 0.12)` | `rgba(255,255,255,0.80)` | Chip nguồn — "CNBC (2025)", "PMC/NIH (2022)" |

**Gradients**

| Token | Giá trị | Dùng cho |
|-------|---------|----------|
| `--grad-brand` | `linear-gradient(135deg, #FF3D8B 0%, #8B5CF6 55%, #60A5FA 100%)` | Viền nút +, viền trái KeyPointCard |
| `--grad-cta` | `linear-gradient(90deg, #F472B6 0%, #A78BFA 50%, #6366F1 100%)` | Nút "Explore now" |
| `--grad-comments-bg` | `linear-gradient(180deg, #E0458F 0%, #C04BB8 35%, #9D4EDD 65%, #5B6CF0 100%)` | Nền SCR-03 |
| `--grad-cover-scrim` | `linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.70) 100%)` | Overlay trên ảnh Cover |
| `--grad-details-scrim` | `linear-gradient(180deg, rgba(11,11,15,0.55) 0%, rgba(11,11,15,0.80) 60%, rgba(11,11,15,0.95) 100%)` | Overlay trên ảnh mờ ở Details |
| `--grad-title-hl` | `linear-gradient(90deg, rgba(255,61,139,0.55), rgba(255,61,139,0.15))` | Nền sau từng dòng tiêu đề Cover |

### 2.2 Typography

Font: **Inter** (Google Fonts, subset `latin` + `vietnamese`), fallback `-apple-system, "SF Pro Text", Roboto, sans-serif`. Bật `font-feature-settings: "cv11", "ss01"` và `-webkit-font-smoothing: antialiased`.

| Token | Size / Line height | Weight | Letter spacing | Dùng cho |
|-------|-------------------|--------|----------------|----------|
| `display` | 31 / 39 | 800 | -0.025em | Tiêu đề Cover (CMP-08) |
| `title-lg` | 20 / 25 | 700 | -0.015em | H2 trong bài ("The problem is not you, it is biology") |
| `title-md` | 21 / 27 | 700 | -0.015em | Tiêu đề Details (khi chưa cuộn), tiêu đề Apply, tiêu đề sheet |
| `hook` | 20 / 28.5 | 600 | -0.012em | Section 1 (hook) |
| `body` | 15.5 / 26 | 500 | 0 | Đoạn văn bài viết |
| `body-sm` | 15 / 23.5 | 500 | 0 | KEY POINT, bình luận, bước Apply |
| `label` | 15 / 20 | 600 | 0 | Tiêu đề nhỏ dính (sticky), pill "Details", tên user |
| `meta` | 13 / 18 | 500 | 0.01em | Số đếm, "Swipe to…", `[Source · N]` |
| `overline` | 12 / 16 | 700 | 0.12em, uppercase | "KEY POINT" |

Các cỡ chữ trên đã được đo lại từ screenshot/video tham chiếu và dùng trong `prototype/reader-demo.html`. Kích thước nút đo được: rail Cover 50px, ActionRow Details 40px (thu còn 32px), nút tìm kiếm/chat ở đáy 50px, nút + 66px ở Cover và thu còn ~52px ở Details.

Highlight chip giữ nguyên cỡ chữ của đoạn chứa nó. In đậm dùng weight 700, nghiêng dùng *italic* thật của Inter.

**Quy tắc typography (apple-design §15):**
- **Tracking theo cỡ chữ, không dùng một giá trị cho mọi cỡ**: chữ lớn (≥ 22px) tracking âm như bảng trên; body để 0; chữ nhỏ (≤ 13px) tracking dương nhẹ (+0.01em đến +0.12em).
- **Leading ngược với cỡ chữ**: tiêu đề chặt (1.1–1.2), body thoáng (≈ 1.58). Tiếng Việt có dấu chồng nên **không** đặt leading tiêu đề dưới 1.1 để dấu không chạm dòng trên.
- **Chữ trên kính mờ (vibrancy)**: không dùng xám phẳng. Text trên glass dùng trắng ≥ 72% opacity và weight ≥ 500.
- Khai báo cỡ chữ bằng `rem` (bảng trên là px quy đổi với root 16px) để tôn trọng cài đặt cỡ chữ của người dùng; layout co giãn theo chữ, không cắt chữ.
- Bật `font-optical-sizing: auto`.

### 2.3 Spacing, radius, elevation

- **Spacing** (lưới 4pt): `4, 8, 12, 16, 20, 24, 32, 40, 48`. Lề ngang nội dung = **16px**; khoảng giữa section = **32px**; giữa H2 và đoạn = **12px**.
- **Radius**: `pill 999px` · `card 20px` · `sheet 28px (top)` · `chip 6px` · `input 999px`.
- **Blur**: `blur-sm 12px` (nút glass) · `blur-md 20px` (pill, bottom buttons) · `blur-lg 32px` (sheet, dropdown) · nền Details `blur(24px) brightness(0.6)`.
  - Bề mặt lớn hơn thì "dày" hơn: blur mạnh hơn + shadow sâu hơn chip nhỏ.
  - Blur ở trên là **tĩnh**. Khi **animate** blur (vd. sheet hiện ra), giữ bán kính ≤ 20px; 2–5px là đủ để làm mềm crossfade. Blur động lớn rất tốn GPU trên Safari.
  - Không chồng một lớp kính sáng lên một lớp kính sáng khác, vì chữ sẽ không đọc được.
  - `prefers-reduced-transparency: reduce` → nền glass chuyển gần đặc (`rgba(20,20,28,0.95)`), bỏ `backdrop-filter`. `prefers-contrast: more` → nền đặc + viền `rgba(255,255,255,0.4)`.
- **Shadow**: `--shadow-float: 0 8px 24px rgba(0,0,0,0.35)`.
- **Glow** nút +: `box-shadow: 0 0 18px rgba(255,61,139,0.45), 0 0 32px rgba(139,92,246,0.35)` + viền gradient 4px. Glow là **tĩnh** (không pulse): một vòng sáng nhấp nháy liên tục ở đáy màn hình làm phân tán khi đọc.
- **Z-index**: `bg 0` · `scrim 1` · `content 10` · `action-rail 20` · `header 30` · `bottom-nav 30` · `sheet 50` · `dropdown 60` · `toast 70`.

### 2.4 Iconography

Thư viện **lucide-react**, stroke 2, màu `--text-primary`. Icon trong nút tròn: 28px (rail Cover), 22px (row Details), 24px (bottom bar), 20px (header).

| Chức năng | Icon | Ghi chú |
|-----------|------|---------|
| Like | `Heart` | Fill trắng khi chưa like (đúng như app gốc), fill `--accent-pink` khi đã like |
| Save | `Bookmark` | Fill trắng / fill `--accent-save` |
| Share | `Send` | Stroke, không fill |
| Comment | `MessageCircle` | Fill trắng |
| Notifications | `BellRing` | |
| Explore | `Compass` | Trong vòng tròn viền 2px |
| Grid | `LayoutGrid` | |
| Swipe hint | `ChevronsRight` | 16px |
| Scroll next | `ChevronDown` | 32px, stroke 3 |
| Search / Create / Chat | `Search` / `Plus` / `MessageCircleMore` | |
| Key point | emoji 💡 | 16px |
| Sources | `Library` | 16px |
| Streak | emoji 🔥 | 22px |

## 3. Component specs (CMP)

Mỗi component: anatomy → kích thước → states → motion → FR liên quan.

### CMP-01 TopBar
- **Anatomy** (trái → phải): Avatar 40px tròn · Tên user (`label`, max-width 130px, ellipsis) · StreakBadge · nút Bell · nút Compass · LangSwitcher (đẩy sang phải bằng `margin-left:auto`).
- **Kích thước**: cao 56px, đặt dưới safe-area-top + 8px; padding ngang 16px; gap 14px giữa các item.
- **Nền**: trong suốt; cover scrim đảm bảo đọc được. Icon không có nền tròn (khác các nút khác).
- **Chưa đăng nhập**: avatar thay bằng icon `UserRound` trong vòng glass, tên = "Sign in".
- FR-19, FR-20, FR-21, FR-22, FR-27.

### CMP-02 StreakBadge
- 🔥 22px + số (`label`, 17px, 700) cách 6px.
- States: `active-today` (màu đầy đủ) · `pending-today` (grayscale 60%, opacity 0.7) · `increment` (animation).
- Motion `increment`: emoji scale 1 → 1.35 → 1 (`spring.pop`, §5.2) + số đếm lăn (slot) lên 1.
- FR-20.

### CMP-03 LangSwitcher + LangDropdown
- **Nút**: pill glass 72×44, text `en`/`vi` (`label` 17px) + `ChevronDown` 16px, viền `--stroke-glass`. Trên nền SCR-03 nền nút chuyển `rgba(60, 10, 40, 0.55)`.
- **Dropdown**: anchor dưới nút, căn phải; rộng 200px; radius 20; nền `rgba(70, 20, 60, 0.72)` + blur-lg; mỗi item cao 48px: [✓ 16px hoặc khoảng trống] · cờ emoji · tên ngôn ngữ (`body-sm` 600). Thứ tự: "Tiếng Việt", "English".
- Motion: scale 0.95 → 1 + opacity 0 → 1, `transform-origin` đặt tại nút trigger (góc trên phải), 180ms `--ease-out`. Đóng theo đúng đường ngược lại, 150ms. Đóng khi chạm ngoài.
- FR-21.

### CMP-04 CircleIconButton (primitive)
- Size `lg` 60px (rail Cover), `md` 52px (row Details), `nav` 64px (bottom bar), `sm` 44px.
- Nền `--surface-glass`, viền 1.5px `rgba(255,255,255,0.18)`, blur-sm, shadow-float.
- States: pressed (`:active`, áp dụng **ngay khi chạm xuống**) scale 0.95 + nền sáng thêm 6%, `transition: transform 120ms var(--ease-out), background-color 120ms`; disabled opacity 0.4; focus-visible ring 2px `--accent-violet`.
- `touch-action: manipulation`, `user-select: none`, `-webkit-touch-callout: none`. Mọi hiệu ứng `:hover` nằm trong `@media (hover: hover) and (pointer: fine)`.

### CMP-05 ActionRail (dọc, Cover)
- Cột bên phải, cách mép phải 12px, đáy rail cách bottom bar 120px; các item cách nhau 18px.
- Item = CircleIconButton `lg` + số đếm (`meta` 15px, `--text-secondary`) bên dưới cách 6px, căn giữa.
- Thứ tự: Like, Save, Share. (Cover không có Comment trên rail — đúng app gốc.)
- FR-10, FR-11, FR-12, FR-13.

### CMP-06 ActionRow (ngang, Details)
- Hàng 4 item: Like, Save, Share, Comment; item = CircleIconButton `md` + số đếm bên dưới. Khoảng cách tâm–tâm 82px, bắt đầu từ lề 16px.
- Nằm ngay dưới tiêu đề Details. Khi nội dung cuộn > 120px, header **thu gọn** (như video từ giây thứ 2): tiêu đề rút thành sticky title `label` 15px dưới hàng pill, ActionRow thu nhỏ còn CircleIconButton `sm` 44px, số đếm 12px, và dính dưới sticky title. Transition 200ms.
- FR-10…FR-14.

### CMP-07 PillButton & SwipeHint
- **PillButton**: cao 48px, padding ngang 28px, radius pill, nền `--surface-glass`, viền `--stroke-glass`, text `label` 17px. Biến thể: "Details" (SCR-02), "Explore" + icon Compass 26px + chấm đỏ 8px `--accent-pink` ở góc trên phải icon (SCR-01).
- **Messages pill** (SCR-06): nền `rgba(255,255,255,0.12)`, text "Messages" + chấm trắng 14px.
- **SwipeHint**: text `meta` 15px 600 `--text-secondary` + `ChevronsRight`; motion: chevron dịch x 0 → 4px, 3 chu kỳ khi user mới vào lần đầu rồi đứng yên (tắt khi reduced-motion).
- Hàng pill + hint: cao 48px, cách lề 16px, hint căn phải.

### CMP-08 CoverTitle
- Text `display`, tối đa 4 dòng, max-width 72% chiều rộng (chừa chỗ cho rail).
- Mỗi dòng có nền `--grad-title-hl` (dùng `box-decoration-break: clone; display:inline; padding: 0 4px`), kèm `text-shadow: 0 0 18px rgba(255,61,139,0.55)` tạo hiệu ứng glow như screenshot 2.
- Vị trí: đỉnh tiêu đề cách đỉnh màn hình ~47% (≈ 400px), ngay dưới hàng Grid/Explore/SwipeHint (cách 28px).
- FR-02.

### CMP-09 ArticleSection
- Props: `variant: 'hook' | 'body'`, `heading?`, `body: RichText`.
- `hook` dùng `hook` typography; `body` dùng `body`. H2 dùng `title-lg`.
- **Focus/dim**: IntersectionObserver với `rootMargin: "-20% 0px -40% 0px"`; section trong vùng → opacity 1; ngoài vùng → opacity 0.35 (`transition: opacity 250ms var(--ease-out)`). Highlight chip trong section mờ cũng mờ theo.
- FR-05, FR-06.

### CMP-10 InlineChip
- `display:inline; padding: 1px 5px; border-radius: 6px; box-decoration-break: clone;` nền theo token `--hl-*`.
- Biến thể `cite`: cỡ chữ = 0.85em, chữ `rgba(255,255,255,0.80)`, `cursor:pointer`, chạm → SourceSheet.
- FR-07.

### CMP-11 KeyPointCard
- Rộng = màn hình − 32px; padding 20px 20px 22px; radius 20; nền `--surface-glass-strong` + blur-lg; viền 1px `--stroke-glass`; **viền trái 3px** dùng `--grad-brand` (pseudo-element, bo theo radius); glow nhẹ phía trên `radial-gradient` hồng 12%.
- Header: 💡 16px + "KEY POINT" (`overline`, `--accent-keypoint`), cách nội dung 14px.
- Nội dung `body-sm` 16/26, hỗ trợ RichText (highlight, italic).
- Motion vào: translateY 16px → 0, opacity 0 → 1, 250ms `--ease-out`, kích hoạt khi visible ≥ 40%, chỉ lần đầu.
- FR-08.

### CMP-12 SourceLine & SourceSheet
- SourceLine: icon `Library` 16px + `[Source · 10]` (`meta`, `--text-tertiary`), margin-top 28px dưới KeyPointCard.
- SourceSheet: bottom sheet radius 28 trên, nền `--bg-elevated`, danh sách nguồn đánh số: tên (`body-sm` 600), nhà xuất bản · năm (`meta`), link mở tab mới.
- FR-07, FR-08.

### CMP-13 ScrollDownButton & PageDots
- ScrollDownButton: CircleIconButton 64px, nền `rgba(30,30,36,0.85)`, `ChevronDown` 32px stroke 3; căn giữa, đáy nút cách đỉnh bottom bar 36px.
- PageDots: căn giữa, dưới nút ⌄ 14px; dot 8px, gap 10px; inactive `rgba(255,255,255,0.40)`, active `#FFFFFF` (không đổi kích thước — đúng app gốc).
- Ở section cuối, nút ⌄ chuyển sang icon `ChevronsRight` gợi ý vuốt sang Comments & Apply.
- FR-06.

### CMP-14 BottomNav
- 3 nút nổi, không có thanh nền. Tâm các nút ở x = 25%, 50%, 75% chiều rộng; đáy cách safe-area-bottom 20px.
- Nút 🔍 và 💬: CircleIconButton `nav` 64px, nền `rgba(20,20,24,0.80)`.
- Nút ➕ (center): 76px, nền trắng `#FFFFFF`, icon `Plus` 36px màu `#111`, stroke 3; viền gradient `--grad-brand` 4px + glow tĩnh (xem 2.3). Khi nhấn: scale 0.95 và glow sáng lên (opacity 1 → 1.4 qua `filter: brightness`), 120ms.
- Ẩn (translateY 120%) trong SCR-03 và khi bàn phím mở.
- FR-23, FR-24, FR-25, FR-26.

### CMP-15 ApplyCard
- Tiêu đề "Turn what you read into what you do" (`title-md`, trắng), mô tả ngắn `body-sm` 80% opacity.
- 3 dòng bước: checkbox tròn 24px (viền trắng 2px; checked → nền trắng + ✓ màu `#C04BB8`), text `body-sm`.
- Nền card `rgba(255,255,255,0.12)`, radius 20, padding 20.
- Loading: skeleton (CMP-20).
- FR-15.

### CMP-16 CommentList & CommentItem
- Tiêu đề section: icon + "{n} Comments" (`label`).
- Item: avatar 36px · cột [tên `label` 14px + thời gian `meta` 60%] · nội dung `body-sm` · hàng hành động (♥ số, "Reply"). Gap giữa item 20px.
- Empty: icon `MessagesSquare` 40px 50% opacity + "No comments yet" (`meta`) căn giữa, cao vùng 180px.
- FR-16.

### CMP-17 CommentInput
- Pill cao 56px, nền `rgba(255,255,255,0.18)`, placeholder "Write a comment" căn giữa (`body-sm`, 70%); khi focus: căn trái, hiện nút gửi ➤ tròn 40px nền trắng ở phải.
- FR-17.

### CMP-18 ExploreCTA
- Nút cao 60px, rộng = màn hình − 32px − 32px (chừa nút phụ), radius pill, nền `--grad-cta`, text "Explore now" `label` 18px + icon `ArrowRightCircle` 22px.
- Bên phải là nút phụ hình viên thuốc 28×60 nền `rgba(30,20,50,0.85)` (mở danh sách bài liên quan).
- FR-18.

### CMP-19 (đã bỏ)
- FoundingBanner của app gốc là paywall giới hạn suất dùng. Reader miễn phí nên **không** có component này. Vùng đó dành cho danh sách bình luận.

### CMP-20 Skeleton
- Khối bo radius tương ứng, nền `rgba(255,255,255,0.14)`, shimmer gradient chạy 1.4s. Dùng cho Apply, comments, lưới Explore.

### CMP-21 MessagesPanel
- Full-screen sheet trượt từ phải, nền `#1C1C22`.
- Header: pill "Messages ●" căn giữa, icon `Users` 26px bên phải.
- Empty: avatar placeholder tròn 56px nền `#3A3A42` icon người + "No conversations yet" (`meta`), căn giữa phần dưới màn hình.
- FR-26.

### CMP-22 Toast
- Pill nền `rgba(20,20,28,0.9)`, text `body-sm`, hiện ở top (dưới header) 2.4s, slide-down + fade.

### CMP-23 LoginSheet
- Bottom sheet: logo Reader, "Sign in to like, save and keep your streak 🔥", nút "Continue with Google" (nền trắng, chữ đen, logo G), "Not now".
- FR-19.

## 4. Screen specs (SCR)

Wireframe trên khung 390×844 (tọa độ y ước lượng, tính từ đỉnh màn hình, đã gồm status bar 47px).

### SCR-01 Feed — Cover view

```
┌──────────────────────────────────────┐ y=0
│ 10:28                     ▂▄▆ 5G ▭  │ status bar
│ (◉) Phương Thảo…  🔥1  🔔  🧭   [en⌄]│ y≈60–116  TopBar
│                                      │
│          ẢNH / VIDEO NỀN             │
│          FULL-BLEED + scrim          │
│                                      │
│ [⊞]     [ Explore 🧭• ]  Swipe to    │ y≈340–388
│                          Details »   │
│ ▓How to make▓                        │ y≈400  CoverTitle
│ ▓smarter decisions▓            (♥)   │ y≈440  ActionRail
│ ▓more easily?▓                 329   │
│                                (🔖)  │
│                                170   │
│                                (✈)   │
│                                 30   │
│                                      │
│      (🔍)       (( + ))      (💬)    │ y≈745–820  BottomNav
└──────────────────────────────────────┘ y=844
```
- Gesture: ↑/↓ đổi bài, ← mở Details, double-tap = like.

### SCR-02 Details view

```
┌──────────────────────────────────────┐
│ (◉) Phương Thảo…  🔥1  🔔  🧭   [en⌄]│ TopBar
│ [ Details ]   Swipe to Comments &    │ y≈200  pill + hint
│               Apply »                │
│ How to make smarter                  │ y≈250  title-md → sticky label khi cuộn
│ decisions more easily?               │
│  (♥)   (🔖)   (✈)   (💬)             │ y≈310  ActionRow
│  329    170    30     0              │
│                                      │
│ Have you ever stood at an important  │ y≈410  hook (26/36), focus
│ crossroads, changing jobs, moving    │
│ homes, or ending a relationship…     │
│ …brain was quietly playing its own   │
│ game.                                │
│                                      │
│ The problem is not you, it is        │ H2, dimmed 35%
│ biology                              │
│ According to data from [CNBC (2025)] │ body, dimmed
│              ( ⌄ )                   │ y≈700  ScrollDownButton
│            ● ○ ○ ○ ○ ○ ○             │ y≈760  PageDots
│      (🔍)       (( + ))      (💬)    │ BottomNav
└──────────────────────────────────────┘
```
- Nền: ảnh cover blur(24px) + `--grad-details-scrim`.
- Khi cuộn: pill row + sticky title + ActionRow `sm` dính dưới TopBar; nội dung chạy phía dưới, đầu đoạn đi vào vùng mờ dần (mask-image gradient 24px).
- Cuối bài: KeyPointCard → SourceLine → khoảng trống 160px để không bị BottomNav che.
- Gesture: cuộn dọc nội dung; → quay lại Cover; ← sang Comments & Apply.

### SCR-03 Comments & Apply

```
┌──────────────────────────────────────┐  nền --grad-comments-bg
│ (◉) Phương Thảo…  🔥1  🔔  🧭   [en⌄]│
│                                      │
│ Turn what you read                   │ ApplyCard
│ into what you do.                    │
│ ◯ Step 1 …                           │
│ ◯ Step 2 …                           │
│ ◯ Step 3 …                           │
│ [  Mark all as done  ]               │
│                                      │
│ 💬 0 Comments                        │ CommentList
│              🗨                      │
│        No comments yet               │
│                                      │
│ (        Write a comment        )    │ CommentInput
│                                      │
│ [   Explore now  ➜   ]  [▮]          │ ExploreCTA
└──────────────────────────────────────┘
```
- Không có BottomNav. Cuộn dọc toàn trang; CommentInput dính đáy khi bàn phím mở.
- Gesture: → quay lại Details.

### SCR-04 Explore
- Header: nút back, tiêu đề "Explore" (`title-md`), ô search nhỏ.
- Hàng chip danh mục cuộn ngang (chip cao 36px, radius pill; active nền trắng chữ đen; inactive glass).
- Lưới 2 cột, thẻ tỉ lệ 3:4, radius 16, ảnh cover + scrim + tiêu đề `label` 15px tối đa 3 dòng, góc dưới: ♥ số đếm `meta`.
- Section "Trending this week" (carousel ngang) ở trên lưới.

### SCR-05 Search
- Ô search pill cao 48 autofocus, nút "Cancel".
- Chưa nhập: "Recent" (chip có ✕) + "Popular terms" (chip highlight hồng nhạt: *decision fatigue*, *confirmation bias*, *dopamine*…).
- Có kết quả: list item cao 88: thumbnail 64×64 radius 12, tiêu đề `label` 2 dòng, danh mục · thời gian đọc `meta`. Từ khóa khớp được tô `--hl-pink`.
- Không có kết quả: "No articles found for “{q}”".

### SCR-06 Messages
- Xem CMP-21. Vào bằng nút 💬 ở BottomNav; nền bài viết phía sau vẫn mờ thấy được trong lúc transition.

### SCR-07 Profile
- Avatar 88px, tên `title-md`, email `meta`.
- 3 thẻ thống kê ngang: 🔥 Current streak · 🏆 Longest · 📚 Articles read.
- Lịch streak 7 ngày gần nhất (vòng tròn: đã đọc = nền `--accent-fire`, chưa = viền trắng 30%).
- Tab "Saved" / "Liked" → lưới 2 cột như Explore.
- Nút "Sign out" (text, màu `--danger`). Chọn ngôn ngữ cũng có ở đây.

### SCR-08 Login
- Xem CMP-23. Dùng làm sheet (khi thao tác cần auth) hoặc trang `/login`.

### SCR-09 Create (coming soon)
- Bottom sheet: icon ✍️, "Share your own insights — coming soon", nút "Notify me" (`--grad-cta`).

### SCR-10 Notifications
- Sheet từ trên xuống hoặc trang `/notifications`: list item (icon loại, nội dung, thời gian). Empty: "You're all caught up ✨".

## 5. Motion spec

### 5.1 Nguyên tắc (apple-design + animate)

1. **Phản hồi khi chạm xuống**, không đợi thả tay. Không có debounce hay timer nhân tạo trên đường input.
2. **Bám 1:1 khi kéo** và giữ đúng điểm bắt (grab offset). Dùng Pointer Events + `setPointerCapture`.
3. **Có thể ngắt ở mọi thời điểm**: không khoá input trong lúc transition. Người dùng có thể bắt lại một trang đang snap và kéo ngược. Animation mới luôn bắt đầu từ **giá trị đang hiển thị**, không phải giá trị đích.
4. **Spring cho mọi thứ chạm được**, không dùng CSS transition/keyframes cho gesture. Spring tách riêng trục X và Y.
5. **Chuyển giao vận tốc**: khi thả tay, spring nhận đúng vận tốc ngón tay (px/s) làm vận tốc ban đầu, để không có "đường nối" giữa kéo và animation.
6. **Chiếu quán tính** (momentum projection): chọn trang đích theo điểm dừng **dự đoán**, không theo vị trí lúc thả:
   ```ts
   const project = (v: number, d = 0.998) => (v / 1000) * d / (1 - d); // v: px/s
   const projected = current + project(velocity);
   const target = nearestSnap(projected); // rồi animate tới target với velocity
   ```
   Hướng commit hay quay lại quyết định theo **dấu của vận tốc** khi thả, không theo vị trí.
7. **Rubber-band ở biên**, không dừng cứng:
   ```ts
   const rubberband = (overshoot: number, dim: number, c = 0.55) =>
     (overshoot * dim * c) / (dim + c * Math.abs(overshoot));
   ```
8. **Đối xứng không gian**: vào theo đường nào thì ra theo đường đó. Dropdown và popover mọc ra từ nút trigger.
9. **Bounce chỉ khi gesture có quán tính** (flick, thả sau kéo). UI tự mở (dropdown, toast) không nảy.
10. **Chỉ animate `transform` và `opacity`**. Với Framer Motion, dùng chuỗi `transform` đầy đủ hoặc `useMotionValue` + `useTransform` gắn trực tiếp vào style. Không animate qua React state từng frame.
11. **Không animate thao tác bàn phím** (↑↓←→, L, S): đổi trạng thái tức thì.

### 5.2 Token motion

```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* vào/ra UI */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* di chuyển trên màn hình */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* sheet kiểu iOS */
  --dur-press: 120ms;
  --dur-small: 180ms;   /* dropdown, tooltip, toast */
  --dur-medium: 250ms;  /* section focus, KEY POINT */
}
```

Không dùng `ease-in` cho UI. Không dùng `transition: all`. Không bắt đầu entrance từ `scale(0)`; dùng `scale(0.95)` + `opacity: 0`.

Spring (Framer Motion, tham số `bounce` + `duration` tương ứng damping ratio + response của Apple):

| Tên | Config | Damping / Response (Apple) | Dùng cho |
|-----|--------|---------------------------|----------|
| `spring.default` | `{ type: 'spring', bounce: 0, duration: 0.4 }` | 1.0 / 0.4 | Snap trang không có flick, sheet mở bằng nút |
| `spring.flick` | `{ type: 'spring', bounce: 0.15, duration: 0.4 }` | ~0.85 / 0.4 | Snap trang sau flick (vận tốc ≥ 500 px/s) |
| `spring.sheet` | `{ type: 'spring', bounce: 0.2, duration: 0.3 }` | 0.8 / 0.3 | Sheet thả sau khi kéo |
| `spring.pop` | `{ type: 'spring', bounce: 0.35, duration: 0.35 }` | — | Tim like, 🔥 streak (khoảnh khắc delight) |

### 5.3 Bảng interaction

| Interaction | Tần suất | Mục đích | Thông số |
|-------------|----------|----------|----------|
| Snap dọc giữa bài | Hàng trăm lần/phiên | Spatial | Track 1:1 → thả: chiếu quán tính, snap tới bài gần điểm dự đoán nhất (tối đa ±1 bài), `spring.flick` nếu \|v\| ≥ 500 px/s, ngược lại `spring.default`; truyền `velocity` |
| Chuyển ngang Cover ⇄ Details ⇄ Comments | Thường xuyên | Spatial | Như trên theo trục X. View rời đi dịch chậm hơn (parallax 0.3×) và mờ tới 0.6. Parallax tính từ cùng một `x` motion value |
| Rubber-band ở biên | — | Feedback | Hàm `rubberband` ở 5.1, `c = 0.55`, `dim` = chiều cao/rộng viewport |
| Nhấn nút | Rất thường xuyên | Feedback | `:active` scale 0.95, 120ms `--ease-out` |
| Like | Thường xuyên | Feedback | Icon `spring.pop` scale 1 → 1.2 → 1, đổi fill cùng frame. **Không** có hạt bung (tần suất quá cao). Double-tap: tim 96px tại điểm chạm, từ scale 0.6 + opacity 0 → 1.1 → 1, fade out sau 500ms |
| Save | Thường xuyên | Feedback | Đổi fill + translateY −3 → 0, 150ms `--ease-out` |
| Section focus/dim | Liên tục khi cuộn | State | `opacity` 250ms `--ease-out` (transition, có thể ngắt) |
| KEY POINT vào | 1 lần/bài | Explanation | translateY 16px → 0 + opacity, 250ms `--ease-out`. Chỉ chạy lần đầu |
| Header Details thu gọn | Khi cuộn | State | Gắn trực tiếp vào scroll progress (`useScroll` + `useTransform`), không dùng timer |
| Streak tăng | Tối đa 1 lần/ngày | Delight | 🔥 `spring.pop` scale 1 → 1.35 → 1 + số lăn lên (`translateY(100%)` → 0); toast cùng frame; `navigator.vibrate(10)` nếu hỗ trợ |
| Hoàn thành Apply (3/3) | Hiếm | Delight | Confetti nhẹ 600ms, tối đa 24 hạt, chỉ dùng transform/opacity |
| Dropdown ngôn ngữ | Thỉnh thoảng | Spatial | scale 0.95 → 1 + opacity, origin tại trigger, 180ms `--ease-out`; đóng 150ms |
| Sheet (Login, Sources, Create) | Thỉnh thoảng | Spatial | Mở: translateY 100% → 0, `spring.default`; backdrop opacity 0 → 0.5. Kéo xuống để đóng: track 1:1, chiếu quán tính, `spring.sheet`. Đóng theo đường đi xuống |
| Messages panel | Thỉnh thoảng | Spatial | Trượt từ phải `translateX(100%)` → 0 và đóng về bên phải; vuốt phải để đóng (track 1:1) |
| Danh sách bình luận vào | Thỉnh thoảng | Prevent jarring | Stagger 40ms, mỗi item translateY 8px → 0 + opacity, 200ms; tối đa 8 item đầu |
| Toast | Thỉnh thoảng | Feedback | Transition (không keyframes) translateY −100% → 0 + opacity, 180ms; ra cùng đường |
| SwipeHint chevron | Lần đầu | Explanation | Dịch x 0 → 4px, 3 chu kỳ rồi dừng (không lặp vô hạn) |

Nền Cover (ảnh) **không** có Ken Burns; video nền là chuyển động duy nhất trên toàn màn hình. Nút + không pulse.

### 5.4 Reduced motion

`prefers-reduced-motion: reduce` nghĩa là animation **ít và nhẹ hơn**, không phải không có:
- Snap trang và chuyển view vẫn bám 1:1 khi kéo (đó là phản hồi trực tiếp), nhưng sau khi thả thì crossfade 150ms tới trang đích thay vì trượt; bỏ parallax và bounce.
- Giữ thay đổi opacity/màu (focus/dim, like đổi màu); bỏ scale pop, confetti, chevron hint, stagger.
- Video nền: dừng ở frame poster, có nút ▶ nhỏ để phát.

### 5.5 Kiểm tra cảm giác

- Xem từng animation ở tốc độ 0.25× trong DevTools Animations và đi từng frame.
- Kiểm tra gesture trên **máy thật** (iPhone qua Safari Web Inspector, Android qua `chrome://inspect`), gồm một máy đời cũ. Device emulation của Chrome không tái hiện được cảm giác chạm, tap delay, safe area hay bàn phím ảo.
- Xem lại vào hôm sau với mắt mới.

## 6. Accessibility & i18n UX

- Chữ luôn nằm trên scrim; kiểm tra tương phản với ảnh sáng nhất trong bộ seed (≥ 4.5:1 cho body).
- Vùng chạm tối thiểu 44×44; số đếm là một phần của nhãn nút: `aria-label="Like, 329 likes"`.
- Feed là `role="feed"`, mỗi bài `role="article"` + `aria-labelledby` tiêu đề; dots có `aria-label="Section 3 of 7"`.
- Chuỗi tiếng Việt dài hơn ~20–30%: không cố định chiều rộng nút chữ; pill và CTA co giãn theo nội dung, tiêu đề cho phép xuống dòng.
- `lang` attribute của nội dung bài đổi theo ngôn ngữ đang hiển thị (để screen reader đọc đúng).
- Safe-area: header `padding-top: env(safe-area-inset-top)`, BottomNav `bottom: calc(20px + env(safe-area-inset-bottom))`.

## 7. Tailwind / CSS variables (copy-ready)

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-bg-base: #0B0B0F;
  --color-bg-elevated: #12121A;
  --color-accent-pink: #FF3D8B;
  --color-accent-violet: #8B5CF6;
  --color-accent-fire: #FF7A1A;
  --color-accent-keypoint: #FF8A3D;
  --color-accent-save: #FACC15;
  --color-danger: #F43F5E;

  --font-sans: "Inter", -apple-system, "SF Pro Text", Roboto, sans-serif;

  --radius-chip: 6px;
  --radius-card: 20px;
  --radius-sheet: 28px;
}

:root {
  --surface-glass: rgba(20, 20, 28, 0.55);
  --surface-glass-strong: rgba(24, 16, 28, 0.78);
  --stroke-glass: rgba(255, 255, 255, 0.10);
  --text-primary: #FFFFFF;
  --text-secondary: rgba(255, 255, 255, 0.72);
  --text-tertiary: rgba(255, 255, 255, 0.50);
  --text-dimmed: rgba(255, 255, 255, 0.35);

  --hl-yellow: rgba(234, 179, 8, 0.35);
  --hl-pink: rgba(244, 63, 94, 0.30);
  --hl-green: rgba(34, 197, 94, 0.30);
  --hl-cite: rgba(255, 255, 255, 0.12);

  --grad-brand: linear-gradient(135deg, #FF3D8B 0%, #8B5CF6 55%, #60A5FA 100%);
  --grad-cta: linear-gradient(90deg, #F472B6 0%, #A78BFA 50%, #6366F1 100%);
  --grad-comments-bg: linear-gradient(180deg, #E0458F 0%, #C04BB8 35%, #9D4EDD 65%, #5B6CF0 100%);
  --grad-cover-scrim: linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 45%, rgba(0,0,0,.70) 100%);
  --grad-details-scrim: linear-gradient(180deg, rgba(11,11,15,.55) 0%, rgba(11,11,15,.80) 60%, rgba(11,11,15,.95) 100%);
  --grad-title-hl: linear-gradient(90deg, rgba(255,61,139,.55), rgba(255,61,139,.15));

  --shadow-float: 0 8px 24px rgba(0, 0, 0, 0.35);
}

html, body { background: var(--color-bg-base); color: var(--text-primary); }
```

## 8. Mobile-native baseline (mobile-native)

Áp dụng từ M0, trước component đầu tiên.

**Next.js `app/[locale]/layout.tsx`**
```ts
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',              // để env(safe-area-inset-*) có giá trị
  interactiveWidget: 'resizes-content',
  themeColor: '#0B0B0F',             // khớp màu đỉnh trang (app chỉ có dark)
  colorScheme: 'dark',
};
// metadata.appleWebApp = { capable: true, statusBarStyle: 'black-translucent', title: 'Reader' }
```
**Không bao giờ** dùng `user-scalable=no` hay `maximum-scale=1`.

**CSS toàn cục**
```css
html {
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
  overscroll-behavior: none;          /* tắt pull-to-refresh và bounce cả trang */
}
.app-shell { height: 100dvh; overflow: hidden; }   /* không dùng 100vh */

button, a, [role="button"], .chip, .pill {
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
/* nội dung bài viết vẫn chọn/copy được, không đặt user-select:none trên body */

input, textarea, select { font-size: 16px; }   /* tránh iOS zoom khi focus */

@media (hover: hover) and (pointer: fine) {
  /* mọi quy tắc :hover đặt ở đây */
}
```

**touch-action theo vùng gesture**

| Vùng | `touch-action` | Lý do |
|------|----------------|-------|
| Cover view (JS xử lý cả dọc lẫn ngang) | `none` | FeedPager + ArticlePager tự xử lý mọi trục |
| Details / Comments & Apply (cuộn native dọc, JS xử lý ngang) | `pan-y` | Trình duyệt giữ cuộn dọc có quán tính native, JS nhận vuốt ngang |
| Container cuộn bên trong (Details, Comments, sheet) | `overscroll-behavior: contain` | Giữ bounce riêng, không kéo trang phía sau |
| Thanh kéo sheet | `none` | Sheet xử lý kéo |

**Input**
- CommentInput: `enterkeyhint="send"`, `autocapitalize="sentences"`. Search: `type="search"`, `enterkeyhint="search"`.
- CommentInput dính trên bàn phím nhờ `interactive-widget=resizes-content` + `100dvh`.

**Safe area**: TopBar `padding-top: env(safe-area-inset-top, 0px)`; BottomNav `bottom: calc(20px + env(safe-area-inset-bottom, 0px))`; sheet `padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px))`.

**Double-tap like**: chỉ nhận double-tap trên vùng nền của Cover (không phải tiêu đề hay nút), để chạm đơn vào tiêu đề mở Details ngay, không bị trễ vì chờ phân biệt double-tap.
