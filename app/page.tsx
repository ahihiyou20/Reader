import { ReaderApp } from '@/components/ReaderApp';
import { COVER_SIZES } from '@/lib/covers';
import { readOptCovers } from '@/lib/covers-server';
import { readFeed } from '@/lib/server/content';

function posterVariant(url: string): string {
  const match = url.match(/\/id\/(\d+)/);
  return match ? `https://picsum.photos/id/${match[1]}/540/960` : url;
}

export default function Home() {
  const first = readFeed().items[0];
  const coverSrc = first ? (first.cover.type === 'video' ? (first.cover.poster ?? first.cover.url) : first.cover.url) : undefined;
  const covers = readOptCovers();
  const opt = first ? covers[first.slug] : undefined;
  const posterCoverSrc = opt?.src ?? (coverSrc ? posterVariant(coverSrc) : undefined);
  const title = first?.title.en ?? '';
  const slug = first?.slug ?? '';
  return (
    <>
      {posterCoverSrc && (
        <link rel="preload" as="image" href={posterCoverSrc} imageSrcSet={opt?.srcSet} imageSizes={opt ? COVER_SIZES : undefined} fetchPriority="high" />
      )}
      <ReaderApp covers={covers} poster={posterCoverSrc ? { coverSrc: posterCoverSrc, srcSet: opt?.srcSet, title, slug } : undefined} />
    </>
  );
}
