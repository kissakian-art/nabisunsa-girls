/**
 * The app's only route to the server.
 *
 * Everything the app shows a family now comes through here rather than
 * straight from Firebase, and the academic advisor is called through the
 * server too. That second change is not cosmetic: the Gemini key used to
 * live in EXPO_PUBLIC_GEMINI_API_KEY, which ships inside the APK and can be
 * read by anyone who downloads it.
 *
 * The token is a bearer credential, so it is kept in the device's secure
 * store rather than AsyncStorage.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'midway_session_token';

/**
 * Where the server lives.
 *
 * A branded build points at the school's own host; development falls back to
 * a local server. This is public configuration, not a secret — unlike the
 * Gemini key it replaces.
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:4500';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
  /** True when the session has expired or been revoked. */
  get isUnauthorised() {
    return this.status === 401;
  }
}

// ---------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------

// SecureStore has no web implementation; the app runs on web only in
// development, where localStorage is an acceptable stand-in.
const webStore = {
  getItemAsync: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
  setItemAsync: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
  deleteItemAsync: async (k: string) => globalThis.localStorage?.removeItem(k),
};
const store = Platform.OS === 'web' ? webStore : SecureStore;

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await store.getItemAsync(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  await store.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  await store.deleteItemAsync(TOKEN_KEY);
}

// ---------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  if (options.auth !== false) {
    const token = await getToken();
    if (!token) throw new ApiError('Not signed in', 401);
    headers.authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // A phone on a Ugandan network drops connections routinely; say so in
    // words a parent can act on rather than surfacing a fetch error.
    throw new ApiError('No connection. Check your internet and try again.', 0);
  }

  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    // An expired token should log the user out, not loop.
    if (response.status === 401) await clearToken();
    throw new ApiError(
      payload?.error ?? 'Something went wrong. Please try again.',
      response.status,
    );
  }

  return payload as T;
}

// ---------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------

export interface Child {
  id: number;
  firstName: string;
  lastName: string;
  registrationNo: string;
  className: string;
  streamName: string | null;
  level: 'O-Level' | 'A-Level';
  photoUrl: string | null;
}

export interface School {
  name: string;
  motto: string | null;
  logoUrl: string | null;
  brandPrimary: string | null;
}

export interface Profile {
  user: { name: string };
  school: School;
  children: Child[];
}

export interface SubjectResult {
  subjectId: number;
  subjectName: string;
  caScore: number | null;
  eotScore: number | null;
  finalScore: number | null;
  grade: string | null;
  points: number | null;
  position: number | null;
  groupSize: number;
}

export interface ResultsPayload {
  child: Child;
  term: { id: number; name: string } | null;
  terms: { id: number; name: string }[];
  results: SubjectResult[];
}

export async function signIn(email: string, password: string): Promise<Profile> {
  const { token } = await request<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  await setToken(token);
  return getProfile();
}

export async function signOut(): Promise<void> {
  await clearToken();
}

export const getProfile = () => request<Profile>('/api/me');

export function getResults(options: { studentId?: number; termId?: number } = {}) {
  const query = new URLSearchParams();
  if (options.studentId) query.set('studentId', String(options.studentId));
  if (options.termId) query.set('termId', String(options.termId));
  const suffix = query.toString() ? `?${query}` : '';
  return request<ResultsPayload>(`/api/results${suffix}`);
}

export interface AdvisorTurn {
  role: 'user' | 'model';
  text: string;
}

/**
 * Asks the academic advisor.
 *
 * The app sends only the question and the conversation so far. Who the
 * student is, what her marks are, and what the advisor may say are all
 * decided on the server — the app cannot claim to be someone else or grant
 * itself a different system prompt.
 */
export function askAdvisor(
  message: string,
  history: AdvisorTurn[] = [],
  studentId?: number,
) {
  return request<{ reply: string }>('/api/advisor', {
    method: 'POST',
    body: { message, history, studentId },
  });
}
