// Weekly export of Firestore to JSON files (uploaded as a workflow artifact, never committed: the repo is public).
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DocumentReference } from 'firebase-admin/firestore';
import { admin } from './admin';

async function dumpDoc(ref: DocumentReference, out: Record<string, unknown>) {
  const snap = await ref.get();
  if (snap.exists) out[ref.path] = snap.data();
  for (const sub of await ref.listCollections()) for (const d of await sub.listDocuments()) await dumpDoc(d, out);
}

async function main() {
  const dir = process.argv[2] ?? 'backup';
  const { db } = admin();
  await fs.mkdir(dir, { recursive: true });
  for (const col of await db.listCollections()) {
    const out: Record<string, unknown> = {};
    for (const d of await col.listDocuments()) await dumpDoc(d, out);
    await fs.writeFile(path.join(dir, `${col.id}.json`), JSON.stringify(out));
    console.log(`${col.id}: ${Object.keys(out).length} documents`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
