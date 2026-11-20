import { z } from 'zod';
import { ALLOWED_LICENSES, LANGS, TLANGS } from './types';

const perLang = <T extends z.ZodTypeAny>(t: T) => Object.fromEntries(TLANGS.map((l) => [l, t.optional()]));
const localized = <T extends z.ZodTypeAny>(t: T) => z.object({ en: t, ...perLang(t) });
const sectionExtras = Object.fromEntries(TLANGS.flatMap((l) => [`heading_${l}`, `body_${l}`]).map((k) => [k, z.string().optional()]));
const nonEmpty = z.string().trim().min(1);
/** A link readers follow: web pages only, never javascript: or data: (the text comes from pages and submissions). */
const webUrl = z.string().regex(/^https?:\/\/[^\s]+$/, 'must be an http(s) URL');

export const coverSchema = z.object({
  type: z.enum(['image', 'video']),
  url: nonEmpty,
  poster: z.string().optional(),
  provider: z.enum(['unsplash', 'pexels', 'wikimedia', 'nasa', 'openverse', 'source', 'own']),
  author: nonEmpty,
  authorUrl: webUrl.optional(),
  license: nonEmpty,
  sourceUrl: webUrl.optional(),
  unsplashDownloadLocation: z.string().optional(),
  wide: z.string().optional(),
  video: z.object({ url: nonEmpty, wide: z.string().optional(), credit: z.string().optional(), source: z.string().optional() }).optional(),
});

export const articleSourceSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase words joined by hyphens'),
  status: z.enum(['draft', 'review', 'published', 'unpublished']),
  publishAt: z.string().optional(),
  previewUrl: z.string().optional(),
  category: nonEmpty,
  title: localized(nonEmpty),
  hook: localized(nonEmpty),
  sections: z
    .array(
      z.object({
        heading_en: z.string().optional(),
        body_en: nonEmpty,
        ...sectionExtras,
      }),
    )
    .min(1),
  keyPoint: localized(z.string()).optional(),
  applySteps: localized(z.array(z.string())).optional(),
  summary: z.object(Object.fromEntries(LANGS.map((l) => [l, z.string().optional()]))).optional(),
  glossary: z.object(Object.fromEntries(LANGS.map((l) => [l, z.record(z.string(), z.string()).optional()]))).optional(),
  references: z.array(z.object({ id: nonEmpty, label: nonEmpty, url: webUrl })).default([]),
  cover: coverSchema,
  coverCandidates: z.array(coverSchema).optional(),
  coverClip: z.string().optional(),
  blurDataURL: z.string().optional(),
  dominant: z.string().optional(),
  origin: z.object({
    group: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    sourceId: z.string().optional(),
    submissionId: z.string().optional(),
    license: z.enum(ALLOWED_LICENSES as [string, ...string[]]),
    authors: z.array(nonEmpty).min(1),
    originalTitle: z.string().optional(),
    originalUrl: webUrl.optional(),
    publisher: z.string().optional(),
    changes: z.array(z.string()),
    permission: z.string().optional(),
  }),
  ai: z.object({ fields: z.array(z.string()), reviewed: z.boolean(), model: z.string().optional() }).optional(),
  seed: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  wordCount: z.number().optional(),
});

export const categorySchema = z.object({
  id: nonEmpty,
  name: localized(nonEmpty),
  emoji: z.string(),
  order: z.number(),
  hasNew: z.boolean().optional(),
});
