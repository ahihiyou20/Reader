import type { Metadata } from 'next';
import Link from 'next/link';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Privacy Policy · Chính sách quyền riêng tư' };

const UPDATED = '2026-10-22';

export default function Privacy() {
  const issues = `https://github.com/${env.repo}/issues`;
  return (
    <div className="doc">
      <main>
        <Link className="back" href="/">
          ← Reader
        </Link>
        <h1>Privacy Policy</h1>
        <p>Last updated {UPDATED}. Tiếng Việt ở bên dưới.</p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <b>Without signing in</b>: a random guest ID created by Firebase Authentication, and what you do in the app (likes, saves,
            reading progress, reading days for your streak, ticked Apply steps, language and time zone).
          </li>
          <li>
            <b>With Google sign-in</b>: your name, email address and profile photo from Google (scopes <code>openid</code>,{' '}
            <code>email</code>, <code>profile</code> only), plus the data above, your comments and the posts you submit.
          </li>
          <li>
            <b>Analytics</b>: Cloudflare Web Analytics counts page views without cookies or personal identifiers.
          </li>
        </ul>

        <h2>Why</h2>
        <p>
          To keep your progress and streak across devices, show your comments with your name, review posts you send, and keep the
          service free of spam. We do not sell data, show ads, or send your data to AI services.
        </p>

        <h2>Where it is stored and for how long</h2>
        <p>
          In Google Firebase (Authentication and Cloud Firestore). Guest data that has not been used for 60 days is deleted
          automatically. Account data is kept until you delete your account. Comments and submitted posts are public by design; posts
          you submit are published under CC BY 4.0 with your display name only (never your email).
        </p>

        <h2>Your rights</h2>
        <ul>
          <li>Download everything we hold about you: Profile → “Download my data”.</li>
          <li>Delete your account and data: Profile → “Delete account”. You can choose to delete your comments too.</li>
          <li>Change your display name or language at any time in Profile.</li>
        </ul>
        <p>
          Google user data is used only to provide the features above, in line with the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including
          its Limited Use requirements. Personal data is processed in line with Vietnam&apos;s Decree 13/2023/NĐ-CP on personal data
          protection.
        </p>
        <p>
          Questions or requests: open an issue at <a href={issues}>{issues}</a> (do not post personal data there; we will reply with a
          private way to reach us).
        </p>

        <h1 style={{ marginTop: 56 }}>Chính sách quyền riêng tư</h1>
        <p>Cập nhật {UPDATED}.</p>
        <h2>Chúng tôi thu thập gì</h2>
        <ul>
          <li>
            <b>Khi chưa đăng nhập</b>: một mã khách ngẫu nhiên do Firebase Authentication tạo, và các thao tác trong app (thích, lưu, tiến
            độ đọc, các ngày đọc để tính chuỗi, các bước Apply đã tick, ngôn ngữ và múi giờ).
          </li>
          <li>
            <b>Khi đăng nhập Google</b>: tên, email và ảnh hồ sơ từ Google (chỉ các quyền <code>openid</code>, <code>email</code>,{' '}
            <code>profile</code>), cùng dữ liệu ở trên, bình luận và bài bạn gửi.
          </li>
          <li>
            <b>Thống kê</b>: Cloudflare Web Analytics đếm lượt xem trang, không dùng cookie hay định danh cá nhân.
          </li>
        </ul>
        <h2>Mục đích</h2>
        <p>
          Giữ tiến độ và chuỗi ngày đọc trên mọi thiết bị, hiển thị bình luận kèm tên bạn, duyệt bài bạn gửi và chống spam. Chúng tôi không
          bán dữ liệu, không quảng cáo và không gửi dữ liệu của bạn cho dịch vụ AI.
        </p>
        <h2>Lưu ở đâu, trong bao lâu</h2>
        <p>
          Trên Google Firebase (Authentication và Cloud Firestore). Dữ liệu khách không dùng trong 60 ngày sẽ tự động bị xoá. Dữ liệu tài
          khoản được giữ cho tới khi bạn xoá tài khoản. Bình luận và bài gửi là nội dung công khai; bài gửi được đăng theo giấy phép CC BY
          4.0 chỉ kèm tên hiển thị (không bao giờ kèm email).
        </p>
        <h2>Quyền của bạn</h2>
        <ul>
          <li>Tải toàn bộ dữ liệu của bạn: Hồ sơ → “Tải dữ liệu của tôi”.</li>
          <li>Xoá tài khoản và dữ liệu: Hồ sơ → “Xoá tài khoản”, có thể chọn xoá luôn bình luận.</li>
          <li>Đổi tên hiển thị hoặc ngôn ngữ bất cứ lúc nào trong Hồ sơ.</li>
        </ul>
        <p>
          Dữ liệu người dùng Google chỉ được dùng cho các tính năng trên, theo Chính sách dữ liệu người dùng của Google API Services. Dữ
          liệu cá nhân được xử lý theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.
        </p>
        <p>
          Câu hỏi hoặc yêu cầu: mở issue tại <a href={issues}>{issues}</a> (đừng đăng dữ liệu cá nhân ở đó; chúng tôi sẽ phản hồi cách
          liên hệ riêng).
        </p>
      </main>
    </div>
  );
}
