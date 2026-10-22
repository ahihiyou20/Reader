import type { Counts, Lang } from '@/lib/content/types';
import type { Streak } from '@/lib/streak';

export type Provider = 'anonymous' | 'google' | 'demo';

export interface AuthUser {
  uid: string;
  provider: Provider;
  isAnonymous: boolean;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
}

export interface ProgressDoc {
  lastSection?: number;
  completed?: boolean;
  completedAt?: number;
  applyDone?: boolean[];
}

export interface UserData {
  displayName: string | null;
  photoURL: string | null;
  lang?: Lang;
  streak: Streak;
  articlesRead: number;
  likes: string[];
  saves: string[];
  progress: Record<string, ProgressDoc>;
  readDays: string[];
  isModerator: boolean;
}

export interface CommentDoc {
  id: string;
  slug: string;
  uid: string;
  displayName: string;
  photoURL: string | null;
  text: string;
  lang: Lang;
  status: 'visible' | 'hidden';
  createdAt: number;
  likeCount: number;
  likedByMe?: boolean;
  pending?: boolean;
}

export interface SubmissionInput {
  title: string;
  hook: string;
  sections: Array<{ heading?: string; body: string }>;
  references: string[];
  coverUrl?: string;
  lang: Lang;
}

export interface SubmissionDoc extends SubmissionInput {
  id: string;
  status: 'pending' | 'imported' | 'published' | 'rejected';
  slug?: string;
  createdAt: number;
}

export type SignInResult =
  | { kind: 'signed-in'; user: AuthUser }
  | { kind: 'merged'; user: AuthUser }
  | { kind: 'redirecting' }
  | { kind: 'cancelled' };

export type BackendErrorCode = 'network' | 'busy' | 'cancelled' | 'auth-required' | 'permission' | 'in-app-browser' | 'unknown';

export class BackendError extends Error {
  constructor(
    public code: BackendErrorCode,
    message?: string,
    public raw?: string,
  ) {
    super(message ?? code);
  }
}

export interface CommentPage {
  items: CommentDoc[];
  cursor: unknown | null;
}

export interface Backend {
  kind: 'firebase' | 'local';
  /** Starts auth; signs in anonymously when nobody is signed in. */
  start(onUser: (u: AuthUser | null) => void): () => void;
  signInWithGoogle(opts?: { redirect?: boolean }): Promise<SignInResult>;
  /** Google One Tap (Chrome/Android): exchanges a GIS ID token for a Firebase session. */
  signInWithIdToken?(idToken: string): Promise<SignInResult>;
  completeRedirect(): Promise<SignInResult | null>;
  signOut(): Promise<void>;
  loadUserData(): Promise<UserData>;
  ensureProfile(lang: Lang): Promise<void>;
  setLike(slug: string, on: boolean): Promise<void>;
  setSave(slug: string, on: boolean): Promise<void>;
  addShare(slug: string): Promise<void>;
  getCounts(slug: string): Promise<Counts | null>;
  listComments(slug: string, cursor?: unknown | null, pageSize?: number): Promise<CommentPage>;
  watchComments(slug: string, onChange: (items: CommentDoc[]) => void, pageSize?: number): () => void;
  addComment(slug: string, text: string, lang: Lang): Promise<CommentDoc>;
  deleteComment(slug: string, id: string): Promise<void>;
  hideComment(slug: string, id: string): Promise<void>;
  setCommentLike(slug: string, id: string, on: boolean): Promise<void>;
  saveProgress(slug: string, lastSection: number): Promise<void>;
  completeArticle(slug: string, today: string, streak: Streak): Promise<void>;
  setApplyDone(slug: string, done: boolean[]): Promise<void>;
  updateProfile(patch: { displayName?: string; lang?: Lang; timezone?: string }): Promise<void>;
  submitPost(input: SubmissionInput): Promise<string>;
  listMySubmissions(): Promise<SubmissionDoc[]>;
  exportData(): Promise<unknown>;
  deleteAccount(opts: { deleteComments: boolean }): Promise<void>;
}

export const commentLikeId = (slug: string, id: string) => `${slug}__${id}`;
