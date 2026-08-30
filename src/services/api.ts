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
import { Brand } from '../constants/brand';

const TOKEN_KEY = 'midway_session_token';

/**
 * Where the server lives.
 *
 * Baked in at build time from the school's own `school.json`, alongside the
 * rest of its branding — see `constants/brand.ts`. Public configuration, not
 * a secret, unlike the Gemini key it replaces.
 */
export const API_BASE = Brand.apiBaseUrl;

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
  /**
   * The school's commercial state. The server refuses to serve marks for a
   * suspended school regardless of what the app does with this — it is here
   * so the app can say why rather than looking broken.
   */
  status: 'trial' | 'active' | 'suspended' | 'closed';
  suspendedReason: string | null;
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

/**
 * Sign in.
 *
 * `identifier` is an email address or a phone number — most families here
 * have the second and not the first. The school is sent with it because a
 * phone number is unique only within one school.
 */
export async function signIn(identifier: string, password: string): Promise<Profile> {
  const { token } = await request<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: { email: identifier, password, school: Brand.slug },
    auth: false,
  });
  await setToken(token);
  return getProfile();
}

/**
 * Turning the school's printed slip into an account.
 *
 * The parent types the registration number and the code from the slip and
 * chooses a password. The server decides everything else — which child,
 * which school, whether the code is still good.
 */
export async function activate(input: {
  registrationNo: string;
  code: string;
  password: string;
  displayName?: string;
  phone?: string;
}): Promise<Profile> {
  const { token } = await request<{ token: string }>('/api/auth/activate', {
    method: 'POST',
    body: { ...input, school: Brand.slug },
    auth: false,
  });
  await setToken(token);
  return getProfile();
}

/** A second slip, for a second daughter, on the same account. */
export function linkChild(registrationNo: string, code: string) {
  return request<{ children: Child[] }>('/api/children/link', {
    method: 'POST',
    body: { registrationNo, code },
  });
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

export interface Announcement {
  id: number;
  title: string;
  body: string;
  isPinned: boolean;
  isUrgent: boolean;
  publishedAt: string | null;
  className: string | null;
  streamName: string | null;
}

/** What the school has told this family. Published, and addressed to them. */
export async function getAnnouncements(): Promise<Announcement[]> {
  const { announcements } = await request<{ announcements: Announcement[] }>(
    '/api/announcements',
  );
  return announcements;
}

/**
 * Tells the server which phone this is, so notifications reach it.
 *
 * Registered against the signed-in account rather than the installation, so
 * an old handset passed on to a relative stops receiving a child's results
 * once someone else signs in on it.
 */
export function registerDevice(token: string, platform: 'android' | 'ios' | 'web') {
  return request<{ ok: true }>('/api/devices', {
    method: 'POST',
    body: { token, platform },
  });
}

export function unregisterDevice(token: string) {
  return request<{ ok: true }>(`/api/devices?token=${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
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
