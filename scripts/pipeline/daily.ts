// Step 9 (docs/05): every night, recount the counters from the source documents (so a bad client
// write cannot drift them for long), bake them into content/generated/counts.json for the static
// feed, and on Sundays remove guest accounts unused for 60 days.
import path from 'node:path';
import type { Counts } from '../../lib/content/types';
import { admin, hasAdminCredentials } from './admin';
import { dirs, jobSummary, listJson, readJson, writeJson } from './lib';

const GUEST_TTL_DAYS = 60;

async function bakeCounts() {
  const { db } = admin();
  const slugs = (await listJson(dirs.articles)).map((f) => f.replace(/\.json$/, ''));
  const counts: Record<string, Counts> = {};
  for (const slug of slugs) {
    const [likes, saves, comments, counter] = await Promise.all([
      db.collectionGroup('likes').where('slug', '==', slug).count().get(),
      db.collectionGroup('saves').where('slug', '==', slug).count().get(),
      db.collection('comments').doc(slug).collection('items').where('status', '==', 'visible').count().get(),
      db.collection('counters').doc(slug).get(),
    ]);
    const c: Counts = {
      likes: likes.data().count,
      saves: saves.data().count,
      comments: comments.data().count,
      shares: (counter.data()?.shares as number | undefined) ?? 0,
    };
    const cur = counter.data() ?? {};
    if (cur.likes !== c.likes || cur.saves !== c.saves || cur.comments !== c.comments) await counter.ref.set(c, { merge: true });
    if (c.likes || c.saves || c.comments || c.shares) counts[slug] = c;
  }
  const file = path.join(dirs.generated, 'counts.json');
  const before = JSON.stringify(await readJson(file, {}));
  await writeJson(file, counts);
  return { changed: before !== JSON.stringify(counts), articles: Object.keys(counts).length };
}

async function deleteUserData(uid: string) {
  const { db } = admin();
  await db.recursiveDelete(db.collection('users').doc(uid));
}

async function cleanGuests() {
  const { auth } = admin();
  const cutoff = Date.now() - GUEST_TTL_DAYS * 86_400_000;
  let removed = 0;
  let page: string | undefined;
  do {
    const res = await auth.listUsers(1000, page);
    for (const u of res.users) {
      if (u.providerData.length > 0) continue; // anonymous accounts have no linked provider
      const last = Date.parse(u.metadata.lastRefreshTime ?? u.metadata.lastSignInTime ?? u.metadata.creationTime);
      if (last > cutoff) continue;
      await deleteUserData(u.uid);
      await auth.deleteUser(u.uid);
      removed++;
    }
    page = res.pageToken;
  } while (page);
  return removed;
}

async function main() {
  if (!hasAdminCredentials()) {
    console.log('No Firebase credentials: skipping counts and cleanup.');
    return;
  }
  const lines: string[] = [];
  const baked = await bakeCounts();
  lines.push(`- Counts baked for ${baked.articles} articles${baked.changed ? ' (changed)' : ' (no change)'}`);
  if (new Date().getUTCDay() === 0 || process.argv.includes('--cleanup')) lines.push(`- Removed ${await cleanGuests()} inactive guest accounts`);
  console.log(lines.join('\n'));
  await jobSummary(`## Daily\n\n${lines.join('\n')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
