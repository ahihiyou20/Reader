import type { Metadata } from 'next';
import Link from 'next/link';
import { env } from '@/lib/env';

// App home page for the Google OAuth consent screen (README §2): says what Pagemoor is, what Google
// sign-in is used for, and links to the privacy policy and terms.
export const metadata: Metadata = {
  title: 'About · Giới thiệu',
  description: 'Pagemoor is a free, non-commercial reading app: short, sourced articles in English, Vietnamese, French, German and Spanish, one swipe at a time.',
  alternates: { canonical: '/about' },
};

export default function About() {
  const repo = `https://github.com/${env.repo}`;
  return (
    <div className="doc">
      <main>
        <Link className="back" href="/">
          ← Pagemoor
        </Link>
        <img className="about-logo" src="/icons/logo-120.png" width={96} height={96} alt="Pagemoor logo" />
        <h1>About Pagemoor</h1>
        <p>
          <b>Pagemoor</b> is a free reading app in English, Vietnamese, French, German and Spanish. Each article is one vertical screen: swipe up for the next one,
          swipe sideways to read the details, then turn the idea into three small steps. It is a personal, non-commercial project run
          for its author and a few friends. There are no ads, no subscriptions and nothing for sale.
        </p>

        <h2>Where the articles come from</h2>
        <ul>
          <li>Adapted from openly licensed sources (NASA, Our World in Data, Wikipedia, Global Voices and others), with full credit.</li>
          <li>Republished word for word when the licence allows only that (for example The Conversation, CC BY-ND).</li>
          <li>
            For copyrighted articles, only Pagemoor&apos;s own short summary is shown, with a clear link to read the original at its
            source.
          </li>
          <li>Written by the editors of Pagemoor.</li>
        </ul>
        <p>Every article lists its source, authors, licence and changes under “Sources”.</p>

        <h2>Signing in with Google</h2>
        <p>
          You can read everything without an account. Signing in with Google is optional and is used only to keep your likes, saves,
          reading progress and streak across devices, and to show your name next to your comments. Pagemoor asks only for your name,
          email address and profile photo (<code>openid</code>, <code>email</code>, <code>profile</code>), never sells or shares them,
          and never sends them to AI services. Details are in the <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>More</h2>
        <ul>
          <li>
            <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms</Link>
          </li>
          <li>
            Source code and contact: <a href={repo}>{repo}</a> (open an issue; please do not post personal data there).
          </li>
        </ul>

        <h1 style={{ marginTop: 56 }}>Giới thiệu Pagemoor</h1>
        <p>
          <b>Pagemoor</b> là ứng dụng đọc miễn phí bằng tiếng Việt, Anh, Pháp, Đức và Tây Ban Nha. Mỗi bài là một màn hình dọc: vuốt lên để sang bài mới,
          vuốt ngang để đọc chi tiết, rồi biến ý tưởng thành ba bước nhỏ. Đây là dự án cá nhân, phi thương mại, dành cho tác giả và vài
          người bạn. Không quảng cáo, không thu phí, không bán gì.
        </p>
        <h2>Bài viết lấy từ đâu</h2>
        <ul>
          <li>Phỏng theo các nguồn có giấy phép mở (NASA, Our World in Data, Wikipedia, Global Voices…), ghi công đầy đủ.</li>
          <li>Đăng lại nguyên văn khi giấy phép chỉ cho phép như vậy (ví dụ The Conversation, CC BY-ND).</li>
          <li>Với bài có bản quyền, Pagemoor chỉ đăng bản tóm tắt ngắn do Pagemoor tự viết, kèm link rõ ràng để đọc bài gốc.</li>
          <li>Bài do biên tập viên Pagemoor tự viết.</li>
        </ul>
        <p>Mỗi bài đều ghi nguồn, tác giả, giấy phép và các thay đổi trong mục “Nguồn”.</p>
        <h2>Đăng nhập bằng Google</h2>
        <p>
          Bạn có thể đọc mọi bài mà không cần tài khoản. Đăng nhập Google là tùy chọn, chỉ dùng để giữ lượt thích, bài đã lưu, tiến độ
          đọc và chuỗi ngày đọc trên mọi thiết bị, và hiện tên bạn cạnh bình luận. Pagemoor chỉ xin tên, email và ảnh hồ sơ, không bán hay
          chia sẻ, và không gửi cho dịch vụ AI. Chi tiết trong <Link href="/privacy">Chính sách quyền riêng tư</Link>.
        </p>
        <h2>Thêm</h2>
        <ul>
          <li>
            <Link href="/privacy">Chính sách quyền riêng tư</Link> · <Link href="/terms">Điều khoản</Link>
          </li>
          <li>
            Mã nguồn và liên hệ: <a href={repo}>{repo}</a> (mở issue; đừng đăng dữ liệu cá nhân ở đó).
          </li>
        </ul>
      </main>
    </div>
  );
}
