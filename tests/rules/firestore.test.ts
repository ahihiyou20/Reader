// Security Rules tests (docs/02 §11): run with `pnpm test:rules` (Firestore emulator).
import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

let env: RulesTestEnvironment;
const guestClaims = { firebase: { sign_in_provider: 'anonymous', identities: {} } };
const googleClaims = { firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['1234'] } } };
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
  it('FR-12: anyone signed in can add a share', async () => {
    await assertSucceeds(setDoc(doc(guest(), 'counters/a1'), { shares: increment(1) }, { merge: true }));
    await assertSucceeds(setDoc(doc(guest(), 'counters/a1'), { shares: increment(1) }, { merge: true }));
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
    const b = writeBatch(db);
    b.set(doc(collection(db, 'comments/a1/items')), comment('alice'));
    b.set(doc(db, 'counters/a1'), { comments: increment(1) }, { merge: true });
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
