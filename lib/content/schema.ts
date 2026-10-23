import { z } from 'zod';
import { ALLOWED_LICENSES } from './types';

const localized = <T extends z.ZodTypeAny>(t: T) => z.object({ en: t, vi: t.optional() });
const nonEmpty = z.string().trim().min(1);

export const coverSchema = z.object({
  type: z.enum(['image', 'video']),
  url: nonEmpty,
  poster: z.string().optional(),
  provider: z.enum(['unsplash', 'pexels', 'wikimedia', 'nasa', 'openverse', 'source', 'own']),
  author: nonEmpty,
  authorUrl: z.string().optional(),
  license: nonEmpty,
  sourceUrl: z.string().optional(),
  unsplashDownloadLocation: z.string().optional(),
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
        heading_vi: z.string().optional(),
        body_en: nonEmpty,
        body_vi: z.string().optional(),
      }),
    )
    .min(1),
  keyPoint: localized(z.string()).optional(),
  applySteps: z.object({ en: z.array(z.string()), vi: z.array(z.string()).optional() }).optional(),
  summary: z.object({ en: z.string().optional(), vi: z.string().optional() }).optional(),
  references: z.array(z.object({ id: nonEmpty, label: nonEmpty, url: z.string() })).default([]),
  cover: coverSchema,
  coverCandidates: z.array(coverSchema).optional(),
  blurDataURL: z.string().optional(),
  dominant: z.string().optional(),
  origin: z.object({
    group: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    sourceId: z.string().optional(),
    submissionId: z.string().optional(),
    license: z.enum(ALLOWED_LICENSES as [string, ...string[]]),
    authors: z.array(nonEmpty).min(1),
    originalTitle: z.string().optional(),
    originalUrl: z.string().optional(),
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
