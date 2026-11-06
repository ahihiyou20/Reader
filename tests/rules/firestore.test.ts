// Security Rules tests (docs/02 §11): run with `pnpm test:rules` (Firestore emulator).
import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

let env: RulesTestEnvironment;
const guestClaims = { firebase: { sign_in_provider: 'anonymous' as const, identities: {} } };
const googleClaims = { firebase: { sign_in_provider: 'google.com' as const, identities: { 'google.com': ['1234'] } } };
const guest = () => env.authenticatedContext('guest', guestClaims).firestore();
const alice = () => env.authenticatedContext('alice', googleClaims).firestore();
const mod = () => env.authenticatedContext('mod', googleClaims).firestore();

const profile = (isAnonymous: boolean) => ({
  displayName: isAnonymous ? null : 'Alice',
  photoURL: null,
  isAnonymous,
  lang: 'vi',
  timezone: 'Asia/Ho_Chi_Minh',
  streak: { current: 0, longest: 0, lastReadDate: null },
  stats: { articlesRead: 0 },
  createdAt: serverTimestamp(),
  lastActiveAt: serverTimestamp(),
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-reader',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { ...profile(false), createdAt: new Date(), lastActiveAt: new Date(), streak: { current: 1, longest: 1, lastReadDate: '2026-10-21' } });
    await setDoc(doc(db, 'moderators/mod'), { role: 'moderator' });
    await setDoc(doc(db, 'comments/a1/items/c1'), { uid: 'alice', displayName: 'Alice', photoURL: null, text: 'Hi', lang: 'en', status: 'visible', likeCount: 0, createdAt: new Date() });
  });
});

describe('users', () => {
  it('FR-20: a guest creates a profile with an empty streak', async () => {
    await assertSucceeds(setDoc(doc(guest(), 'users/guest'), profile(true)));
  });
  it('cannot create a profile with a head-start streak', async () => {
    await assertFails(setDoc(doc(guest(), 'users/guest'), { ...profile(true), streak: { current: 5, longest: 5, lastReadDate: '2026-10-22' } }));
  });
  it('a guest cannot pretend to be a Google account', async () => {
    await assertFails(setDoc(doc(guest(), 'users/guest'), profile(false)));
  });
  it('cannot read someone else', async () => {
    await assertFails(getDoc(doc(guest(), 'users/alice')));
  });
  it('streak can grow by one, stay or restart at one, never jump', async () => {
    const db = alice();
    await assertFails(updateDoc(doc(db, 'users/alice'), { streak: { current: 3, longest: 3, lastReadDate: '2026-10-22' } }));
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { streak: { current: 2, longest: 2, lastReadDate: '2026-10-22' } }));
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { streak: { current: 1, longest: 2, lastReadDate: '2026-10-25' } }));
  });
  it('cannot add unknown fields', async () => {
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { role: 'admin' }));
  });
});

describe('counters', () => {
  it('FR-10: like = like document + counter +1 in one batch', async () => {
    const db = guest();
    const b = writeBatch(db);
    b.set(doc(db, 'users/guest/likes/a1'), { slug: 'a1', createdAt: serverTimestamp() });
    b.set(doc(db, 'counters/a1'), { likes: increment(1) }, { merge: true });
    await assertSucceeds(b.commit());
    const u = writeBatch(db);
    u.delete(doc(db, 'users/guest/likes/a1'));
    u.set(doc(db, 'counters/a1'), { likes: increment(-1) }, { merge: true });
    await assertSucceeds(u.commit());
  });
  it('a counter cannot move without the matching like', async () => {
    await assertFails(setDoc(doc(guest(), 'counters/a1'), { likes: increment(1) }, { merge: true }));
  });
  it('a counter cannot move by more than one', async () => {
    const db = guest();
    const b = writeBatch(db);
    b.set(doc(db, 'users/guest/likes/a1'), { slug: 'a1', createdAt: serverTimestamp() });
    b.set(doc(db, 'counters/a1'), { likes: increment(2) }, { merge: true });
    await assertFails(b.commit());
  });
  it('the same like is counted once', async () => {
    const db = guest();
    const b = writeBatch(db);
    b.set(doc(db, 'users/guest/likes/a1'), { slug: 'a1', createdAt: serverTimestamp() });
    b.set(doc(db, 'counters/a1'), { likes: increment(1) }, { merge: true });
    await assertSucceeds(b.commit());
    await assertFails(setDoc(doc(db, 'counters/a1'), { likes: increment(1) }, { merge: true }));
    const again = writeBatch(db);
    again.set(doc(db, 'users/guest/likes/a1'), { slug: 'a1', createdAt: serverTimestamp() });
    again.set(doc(db, 'counters/a1'), { likes: increment(1) }, { merge: true });
    await assertFails(again.commit());
  });
  it("cannot take away other readers' likes", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'counters/a1'), { likes: 5 }));
    await assertFails(setDoc(doc(guest(), 'counters/a1'), { likes: increment(-1) }, { merge: true }));
  });
  it('account deletion: 9 unlikes with their counters fit in one batch', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      for (let i = 0; i < 9; i++) {
        await setDoc(doc(ctx.firestore(), `users/guest/likes/s${i}`), { slug: `s${i}`, createdAt: new Date() });
        await setDoc(doc(ctx.firestore(), `counters/s${i}`), { likes: 1 });
      }
    });
    const db = guest();
    const b = writeBatch(db);
    for (let i = 0; i < 9; i++) {
      b.delete(doc(db, `users/guest/likes/s${i}`));
      b.set(doc(db, `counters/s${i}`), { likes: increment(-1) }, { merge: true });
    }
    await assertSucceeds(b.commit());
  });
  it('FR-12: a share is counted once per reader, with its share document', async () => {
    const db = guest();
    await assertFails(setDoc(doc(db, 'counters/a1'), { shares: increment(1) }, { merge: true }));
    const share = () => {
      const b = writeBatch(db);
      b.set(doc(db, 'users/guest/shares/a1'), { slug: 'a1', createdAt: serverTimestamp() });
      b.set(doc(db, 'counters/a1'), { shares: increment(1) }, { merge: true });
      return b.commit();
    };
    await assertSucceeds(share());
    await assertFails(share());
    await assertFails(setDoc(doc(db, 'counters/a1'), { shares: increment(1) }, { merge: true }));
  });
  it('signed-out visitors cannot write', async () => {
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'counters/a1'), { shares: increment(1) }, { merge: true }));
  });
});

describe('comments', () => {
  const comment = (uid: string, text = 'Great read') => ({
    uid,
    displayName: 'Alice',
    photoURL: null,
    text,
    lang: 'en',
    status: 'visible',
    likeCount: 0,
    createdAt: serverTimestamp(),
  });
  it('FR-17: a guest cannot comment', async () => {
    await assertFails(addDoc(collection(guest(), 'comments/a1/items'), comment('guest')));
  });
  it('a Google user comments and bumps the counter', async () => {
    const db = alice();
    const ref = doc(collection(db, 'comments/a1/items'));
    const b = writeBatch(db);
    b.set(ref, comment('alice'));
    b.set(doc(db, 'counters/a1'), { comments: increment(1), lastComment: ref.id }, { merge: true });
    await assertSucceeds(b.commit());
  });
  it('the comment counter moves only with a comment created or removed in the same write', async () => {
    const db = alice();
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'counters/a1'), { comments: 3 }));
    const counter = doc(db, 'counters/a1');
    await assertFails(setDoc(counter, { comments: increment(1) }, { merge: true }));
    await assertFails(setDoc(counter, { comments: increment(1), lastComment: 'nope' }, { merge: true }));
    await assertFails(setDoc(counter, { comments: increment(1), lastComment: 'c1' }, { merge: true }));
    await assertFails(setDoc(counter, { comments: increment(-1), lastComment: 'c1' }, { merge: true }));
    const ref = doc(collection(db, 'comments/a1/items'));
    const two = writeBatch(db);
    two.set(ref, comment('alice'));
    two.set(counter, { comments: increment(2), lastComment: ref.id }, { merge: true });
    await assertFails(two.commit());
  });
  it('deleting a visible comment takes one off the counter, once', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'counters/a1'), { comments: 1 }));
    const db = alice();
    const b = writeBatch(db);
    b.delete(doc(db, 'comments/a1/items/c1'));
    b.set(doc(db, 'counters/a1'), { comments: increment(-1), lastComment: 'c1' }, { merge: true });
    await assertSucceeds(b.commit());
    const again = writeBatch(db);
    again.delete(doc(db, 'comments/a1/items/c1'));
    again.set(doc(db, 'counters/a1'), { comments: increment(-1), lastComment: 'c1' }, { merge: true });
    await assertFails(again.commit());
  });
  it('a moderator hiding a comment takes one off; a hidden comment is not taken off again', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'counters/a1'), { comments: 2 }));
    const m = mod();
    const hide = writeBatch(m);
    hide.update(doc(m, 'comments/a1/items/c1'), { status: 'hidden' });
    hide.set(doc(m, 'counters/a1'), { comments: increment(-1), lastComment: 'c1' }, { merge: true });
    await assertSucceeds(hide.commit());
    const db = alice();
    const del = writeBatch(db);
    del.delete(doc(db, 'comments/a1/items/c1'));
    del.set(doc(db, 'counters/a1'), { comments: increment(-1), lastComment: 'c1' }, { merge: true });
    await assertFails(del.commit());
    await assertSucceeds(deleteDoc(doc(db, 'comments/a1/items/c1')));
  });
  it('account deletion: 9 comments with their counters fit in one batch', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      for (let i = 0; i < 9; i++) {
        await setDoc(doc(ctx.firestore(), `comments/s${i}/items/x${i}`), { ...comment('alice'), createdAt: new Date() });
        await setDoc(doc(ctx.firestore(), `counters/s${i}`), { comments: 1 });
      }
    });
    const db = alice();
    const b = writeBatch(db);
    for (let i = 0; i < 9; i++) {
      b.delete(doc(db, `comments/s${i}/items/x${i}`));
      b.set(doc(db, `counters/s${i}`), { comments: increment(-1), lastComment: `x${i}` }, { merge: true });
    }
    await assertSucceeds(b.commit());
  });
  it('comments are 500 characters at most', async () => {
    await assertFails(addDoc(collection(alice(), 'comments/a1/items'), comment('alice', 'x'.repeat(501))));
  });
  it('cannot comment as someone else', async () => {
    await assertFails(addDoc(collection(alice(), 'comments/a1/items'), comment('bob')));
  });
  it('comment likes need the like document', async () => {
    const db = guest();
    await assertFails(updateDoc(doc(db, 'comments/a1/items/c1'), { likeCount: increment(1) }));
    const b = writeBatch(db);
    b.set(doc(db, 'users/guest/commentLikes/a1__c1'), { slug: 'a1', id: 'c1', createdAt: serverTimestamp() });
    b.update(doc(db, 'comments/a1/items/c1'), { likeCount: increment(1) });
    await assertSucceeds(b.commit());
    await assertFails(updateDoc(doc(db, 'comments/a1/items/c1'), { likeCount: increment(1) }));
  });
  it('only moderators hide comments', async () => {
    await assertFails(updateDoc(doc(guest(), 'comments/a1/items/c1'), { status: 'hidden' }));
    await assertSucceeds(updateDoc(doc(mod(), 'comments/a1/items/c1'), { status: 'hidden' }));
  });
  it('authors can delete or anonymise their own comments', async () => {
    await assertSucceeds(updateDoc(doc(alice(), 'comments/a1/items/c1'), { displayName: 'Deleted user', photoURL: null }));
    await assertFails(deleteDoc(doc(guest(), 'comments/a1/items/c1')));
    await assertSucceeds(deleteDoc(doc(alice(), 'comments/a1/items/c1')));
  });
});

describe('submissions (FR-25)', () => {
  const post = (uid: string, title = 'My post') => ({
    uid,
    displayName: 'Alice',
    title,
    hook: 'Why this matters',
    sections: [{ heading: '', body: 'Body' }],
    references: [],
    coverUrl: '',
    lang: 'vi',
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  it('guests cannot submit', async () => {
    await assertFails(addDoc(collection(guest(), 'submissions'), post('guest')));
  });
  it('Google users submit pending posts', async () => {
    await assertSucceeds(addDoc(collection(alice(), 'submissions'), post('alice')));
  });
  it('titles are 120 characters at most and status starts pending', async () => {
    await assertFails(addDoc(collection(alice(), 'submissions'), post('alice', 'x'.repeat(121))));
    await assertFails(addDoc(collection(alice(), 'submissions'), { ...post('alice'), status: 'published' }));
  });
});
