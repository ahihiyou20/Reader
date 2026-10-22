import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Terms · Điều khoản' };

export default function Terms() {
  return (
    <div className="doc">
      <main>
        <Link className="back" href="/">
          ← Reader
        </Link>
        <h1>Terms of use</h1>
        <p>Reader is free. There are no paid plans, limits on reading, or ads. Tiếng Việt ở bên dưới.</p>
        <h2>Content</h2>
        <p>
          Articles are adapted from openly licensed sources (such as CC BY and public-domain works) or written for Reader. Each article
          names its source, licence and the changes made; tap <i>[Source · N]</i> at the end of an article. Reader&apos;s own text is
          available under CC BY 4.0, and articles adapted from CC BY-SA sources stay under CC BY-SA 4.0. Cover photos keep the licence
          shown in their credit.
        </p>
        <p>Articles are for general knowledge, not medical, legal or financial advice.</p>
        <h2>Your posts and comments</h2>
        <ul>
          <li>Be respectful. No harassment, hate, spam, personal data of others, or content you do not have the right to share.</li>
          <li>Moderators may hide comments that break these rules.</li>
          <li>
            Posts you submit with the + button are reviewed by editors and, if accepted, published under CC BY 4.0 with your display
            name. Only submit text you wrote yourself, and link the sources of any facts.
          </li>
        </ul>
        <h2>Accounts</h2>
        <p>You can read without an account. You can delete your account at any time from Profile.</p>
        <h2>No warranty</h2>
        <p>The service is provided as is. We may change or discontinue features.</p>

        <h1 style={{ marginTop: 56 }}>Điều khoản sử dụng</h1>
        <p>Reader miễn phí: không có gói trả phí, không giới hạn số bài đọc, không quảng cáo.</p>
        <h2>Nội dung</h2>
        <p>
          Bài viết được phỏng theo các nguồn có giấy phép mở (như CC BY và tác phẩm thuộc phạm vi công cộng) hoặc được viết cho Reader. Mỗi
          bài ghi rõ nguồn, giấy phép và các thay đổi; chạm <i>[Nguồn · N]</i> ở cuối bài để xem. Phần chữ của Reader dùng giấy phép CC BY
          4.0; bài phỏng theo nguồn CC BY-SA giữ giấy phép CC BY-SA 4.0. Ảnh bìa theo giấy phép ghi trong phần ghi công.
        </p>
        <p>Bài viết mang tính kiến thức phổ thông, không phải lời khuyên y tế, pháp lý hay tài chính.</p>
        <h2>Bài và bình luận của bạn</h2>
        <ul>
          <li>Tôn trọng người khác. Không quấy rối, thù ghét, spam, đăng dữ liệu cá nhân của người khác hay nội dung bạn không có quyền chia sẻ.</li>
          <li>Người kiểm duyệt có thể ẩn bình luận vi phạm.</li>
          <li>
            Bài gửi qua nút + được biên tập viên duyệt và, nếu được nhận, đăng theo giấy phép CC BY 4.0 kèm tên hiển thị của bạn. Chỉ gửi bài
            do bạn tự viết và dẫn nguồn cho các số liệu.
          </li>
        </ul>
        <h2>Tài khoản</h2>
        <p>Bạn có thể đọc mà không cần tài khoản, và có thể xoá tài khoản bất cứ lúc nào trong Hồ sơ.</p>
        <h2>Không bảo đảm</h2>
        <p>Dịch vụ được cung cấp nguyên trạng. Chúng tôi có thể thay đổi hoặc ngừng các tính năng.</p>
      </main>
    </div>
  );
}
