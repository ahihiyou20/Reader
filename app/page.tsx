import { ReaderApp } from '@/components/ReaderApp';
import { readFeed } from '@/lib/server/content';

export default function Home() {
  const first = readFeed().items[0];
  const cover = first ? (first.cover.type === 'video' ? first.cover.poster : first.cover.url) : undefined;
  return (
    <>
      {cover && <link rel="preload" as="image" href={cover} fetchPriority="high" />}
      <ReaderApp />
    </>
  );
}
