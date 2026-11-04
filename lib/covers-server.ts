// Build-time read of public/data/covers.json for the static pages.
import fs from 'node:fs';
import path from 'node:path';
import type { OptCovers } from './covers';

export function readOptCovers(): OptCovers {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'covers.json'), 'utf8')) as OptCovers;
  } catch {
    return {};
  }
}
