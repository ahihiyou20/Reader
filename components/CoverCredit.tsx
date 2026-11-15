'use client';
import { Fragment } from 'react';
import type { CoverClient } from '@/lib/content/types';
import { useT } from './hooks';

const UTM = 'utm_source=pagemoor&utm_medium=referral';
const SITE: Partial<Record<CoverClient['provider'], { name: string; url: string }>> = {
  unsplash: { name: 'Unsplash', url: `https://unsplash.com/?${UTM}` },
  pexels: { name: 'Pexels', url: 'https://www.pexels.com/' },
  wikimedia: { name: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/' },
  nasa: { name: 'NASA', url: 'https://images.nasa.gov/' },
};

const withUtm = (url: string) => (url.includes('unsplash.com') && !url.includes('utm_source') ? `${url}${url.includes('?') ? '&' : '?'}${UTM}` : url);

/**
 * "Photo by <photographer> on Unsplash", both linked: Unsplash's API guidelines ask for this wherever
 * one of their photos is shown, with the referral parameters on every link back.
 */
export function CoverCredit({ cover, className }: { cover: CoverClient; className?: string }) {
  const t = useT();
  const site = SITE[cover.provider];
  const author = cover.authorUrl ?? cover.sourceUrl;
  const links: Record<string, React.ReactNode> = {
    author: author ? (
      <a href={withUtm(author)} target="_blank" rel="noopener noreferrer">
        {cover.author}
      </a>
    ) : (
      cover.author
    ),
    site: site ? (
      <a href={site.url} target="_blank" rel="noopener noreferrer">
        {site.name}
      </a>
    ) : (
      cover.license
    ),
  };
  const fill = (template: string) => template.split(/(\{author\}|\{site\})/).map((part, i) => <Fragment key={i}>{links[part.slice(1, -1)] ?? part}</Fragment>);
  return (
    <p className={className}>
      {fill(t('photoBy'))}
      {cover.video?.credit && (
        <>
          {' · '}
          {t('videoBy').replace('{site}', cover.video.credit)}
        </>
      )}
    </p>
  );
}
