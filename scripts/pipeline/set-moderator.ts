// Grant or remove the moderator role (docs/07 §6): pnpm tsx scripts/pipeline/set-moderator.ts <uid|email> [--remove]
import { admin } from './admin';

async function main() {
  const [who] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!who) throw new Error('usage: set-moderator.ts <uid|email> [--remove]');
  const { db, auth } = admin();
  const user = who.includes('@') ? await auth.getUserByEmail(who) : await auth.getUser(who);
  const ref = db.collection('moderators').doc(user.uid);
  if (process.argv.includes('--remove')) await ref.delete();
  else await ref.set({ role: 'moderator', since: new Date() });
  console.log(`${process.argv.includes('--remove') ? 'Removed' : 'Granted'} moderator: ${user.uid}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
