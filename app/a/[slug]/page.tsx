import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReaderApp } from '@/components/ReaderApp';
import { richToText } from '@/lib/content/markup';
import { readArticle, readFeed } from '@/lib/server/content';

export const dynamicParams = false;

export function generateStaticParams() {
  const items = readFeed().items;
  return items.length ? items.map((i) => ({ slug: i.slug })) : [{ slug: '_' }];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = readArticle(slug);
  if (!a) return { title: 'Reader' };
  const description = richToText(a.hook.en).slice(0, 180);
  const image = a.cover.type === 'video' ? a.cover.poster : a.cover.url;
  return {
    title: a.title.en,
    description,
    alternates: { canonical: `/a/${slug}` },
    openGraph: { type: 'article', title: a.title.en, description, images: image ? [image] : undefined, publishedTime: a.publishedAt },
    twitter: { card: 'summary_large_image', title: a.title.en, description, images: image ? [image] : undefined },
  };
}

/** Deep link: the feed starts with this article. The text is also rendered for crawlers and no-JS readers. */
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = readArticle(slug);
  if (!a) notFound();
  const cover = a.cover.type === 'video' ? a.cover.poster : a.cover.url;
  return (
    <>
      {cover && <link rel="preload" as="image" href={cover} fetchPriority="high" />}
      <ReaderApp initialSlug={slug}>
        <article id="seo" className="sr-only">
          <h1>{a.title.en}</h1>
          <p>{richToText(a.hook.en)}</p>
          {a.sections.map((s, i) => (
            <section key={i}>
              {s.heading && <h2>{s.heading.en}</h2>}
              <p>{richToText(s.body.en)}</p>
            </section>
          ))}
          {a.keyPoint && <p>{richToText(a.keyPoint.en)}</p>}
          <p>{a.attribution.en}</p>
        </article>
      </ReaderApp>
    </>
  );
}
