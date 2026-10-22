import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="doc">
      <main>
        <h1>404</h1>
        <p>This page doesn&apos;t exist. / Trang này không tồn tại.</p>
        <p>
          <Link href="/">← Reader</Link>
        </p>
      </main>
    </div>
  );
}
