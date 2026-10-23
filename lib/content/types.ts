// Content types shared by the build script, the preview page and the client (docs/06 §2).

export type Lang = 'en' | 'vi';
export const LANGS: Lang[] = ['en', 'vi'];
export type Localized<T> = { en: T; vi?: T };

export type HlColor = 'yellow' | 'pink' | 'green';

export type InlineNode =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'italic'; v: string }
  | { t: 'hl'; v: string; color: HlColor; bold?: boolean; italic?: boolean }
  | { t: 'cite'; v: string; refId: string };

/** A rich block: paragraphs, each a list of inline nodes. */
export type Rich = InlineNode[][];

export type ArticleStatus = 'draft' | 'review' | 'published' | 'unpublished';
export type CoverProvider = 'unsplash' | 'pexels' | 'wikimedia' | 'nasa' | 'openverse' | 'source' | 'own';
export type License =
  | 'CC-BY-4.0'
  | 'CC-BY-3.0'
  | 'CC-BY-SA-4.0'
  | 'CC-BY-ND-4.0'
  | 'CC-BY-NC-4.0'
  | 'CC-BY-NC-SA-4.0'
  | 'CC-BY-NC-ND-4.0'
  | 'PD'
  | 'Reader-CC-BY-4.0'
  | 'Copyright';
export const ALLOWED_LICENSES: License[] = [
  'CC-BY-4.0',
  'CC-BY-3.0',
  'CC-BY-SA-4.0',
  'CC-BY-ND-4.0',
  'CC-BY-NC-4.0',
  'CC-BY-NC-SA-4.0',
  'CC-BY-NC-ND-4.0',
  'PD',
  'Reader-CC-BY-4.0',
  'Copyright',
];
/** Content groups (docs/05 §2): 1 adapt, 2 share-alike, 3 verbatim (no derivatives), 4 written for Reader, 5 summary + link. */
export type ContentGroup = 1 | 2 | 3 | 4 | 5;
export const SHARE_ALIKE: License[] = ['CC-BY-SA-4.0', 'CC-BY-NC-SA-4.0'];
export const NO_DERIVATIVES: License[] = ['CC-BY-ND-4.0', 'CC-BY-NC-ND-4.0'];

export interface Reference {
  id: string;
  label: string;
  url: string;
}

export interface CoverSource {
  type: 'image' | 'video';
  url: string;
  poster?: string;
  provider: CoverProvider;
  author: string;
  authorUrl?: string;
  license: string;
  sourceUrl?: string;
  unsplashDownloadLocation?: string;
}

/** File edited in the CMS: content/articles/<slug>.json. Text fields hold markup (docs/05 §6.3). */
export interface ArticleSource {
  slug: string;
  status: ArticleStatus;
  publishAt?: string;
  previewUrl?: string;
  category: string;
  title: Localized<string>;
  hook: Localized<string>;
  sections: Array<{ heading_en?: string; heading_vi?: string; body_en: string; body_vi?: string }>;
  keyPoint?: Localized<string>;
  applySteps?: Localized<string[]>;
  /** Group 3 only: Reader's own short summary, shown to Vietnamese readers because the text cannot be translated. */
  summary?: { en?: string; vi?: string };
  references: Reference[];
  cover: CoverSource;
  coverCandidates?: CoverSource[];
  blurDataURL?: string;
  dominant?: string;
  origin: {
    group: ContentGroup;
    sourceId?: string;
    submissionId?: string;
    license: License;
    authors: string[];
    originalTitle?: string;
    originalUrl?: string;
    publisher?: string;
    changes: string[];
    permission?: string;
  };
  ai?: { fields: string[]; reviewed: boolean; model?: string };
  /** Launch content prepared by the developers; editors should review it and clear this flag. */
  seed?: boolean;
  tags?: string[];
  wordCount?: number;
}

export interface Counts {
  likes: number;
  saves: number;
  shares: number;
  comments: number;
}
export const ZERO_COUNTS: Counts = { likes: 0, saves: 0, shares: 0, comments: 0 };

export interface CoverClient {
  type: 'image' | 'video';
  url: string;
  poster?: string;
  blurDataURL?: string;
  dominant: string;
  author: string;
  authorUrl?: string;
  license: string;
  provider: CoverProvider;
  sourceUrl?: string;
}

/** public/data/articles/<slug>.json */
export interface ArticleClient {
  slug: string;
  category: string;
  publishedAt: string;
  title: Localized<string>;
  hook: Localized<Rich>;
  sections: Array<{ heading?: Localized<string>; body: Localized<Rich> }>;
  keyPoint?: Localized<Rich>;
  applySteps?: Localized<string[]>;
  summary?: Localized<Rich>;
  references: Reference[];
  cover: CoverClient;
  origin: ArticleSource['origin'];
  attribution: Localized<string>;
  counts: Counts;
  readingMinutes: number;
  wordCount: number;
  /** true when every visible field has a Vietnamese version */
  hasVi: boolean;
}

/** One row of public/data/feed.json */
export interface FeedItem {
  slug: string;
  category: string;
  publishedAt: string;
  title: Localized<string>;
  cover: CoverClient;
  counts: Counts;
  readingMinutes: number;
  sections: number;
  hasVi: boolean;
}

export interface Category {
  id: string;
  name: Localized<string>;
  emoji: string;
  order: number;
  hasNew?: boolean;
}

export interface FeedFile {
  builtAt: string;
  items: FeedItem[];
}
