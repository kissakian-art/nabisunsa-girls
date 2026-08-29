/**
 * Who is signed in, and which child is being looked at.
 *
 * This replaces Firebase Auth's `onAuthStateChanged`: the session is now a
 * bearer token issued by the school's own server, and the profile behind it
 * comes from `/api/me`.
 *
 * Two things here exist because of where this app is used:
 *
 * 1. The last profile is cached on the device. Firestore's offline cache
 *    used to make the app open to something useful without a network; a
 *    parent on a Ugandan network opening the app to a spinner would be a
 *    step backwards, so launching offline still shows the school, the
 *    children and a plain warning.
 *
 * 2. A failed refresh does NOT sign anyone out. Only a 401 does — an expired
 *    or revoked token. Losing the session every time a taxi goes through a
 *    dead spot would be its own kind of broken.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ApiError,
  activate as apiActivate,
  getProfile,
  getToken,
  linkChild as apiLinkChild,
  signIn as apiSignIn,
  signOut as apiSignOut,
  type Child,
  type Profile,
} from './api';

const PROFILE_CACHE_KEY = 'midway_profile_cache';
const ACTIVE_CHILD_KEY = 'midway_active_child';

export interface SessionValue {
  /** True until the first attempt to restore a session has finished. */
  loading: boolean;
  profile: Profile | null;
  /** The child whose results are on screen. Null before sign-in. */
  activeChild: Child | null;
  /** True when the profile on screen came from the cache, not the server. */
  stale: boolean;
  /** The school has been switched off by Midway. */
  locked: boolean;
  lockReason: string | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  /** Turning the school's printed slip into an account. */
  activate: (input: {
    registrationNo: string;
    code: string;
    password: string;
    displayName?: string;
    phone?: string;
  }) => Promise<void>;
  /** A second slip, for a second daughter, on the same account. */
  linkChild: (registrationNo: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectChild: (studentId: number) => void;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stale, setStale] = useState(false);
  const [activeChildId, setActiveChildId] = useState<number | null>(null);

  const remember = useCallback(async (next: Profile) => {
    setProfile(next);
    setStale(false);
    try {
      await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(next));
    } catch {
      // A cache that cannot be written is not worth failing a sign-in over.
    }
  }, []);

  const forget = useCallback(async () => {
    setProfile(null);
    setActiveChildId(null);
    setStale(false);
    await AsyncStorage.multiRemove([PROFILE_CACHE_KEY, ACTIVE_CHILD_KEY]).catch(() => {});
  }, []);

  // Restore on launch.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }

      // Show the cached profile immediately, then correct it from the server.
      const [cached, savedChild] = await Promise.all([
        AsyncStorage.getItem(PROFILE_CACHE_KEY).catch(() => null),
        AsyncStorage.getItem(ACTIVE_CHILD_KEY).catch(() => null),
      ]);
      if (cached && !cancelled) {
        try {
          setProfile(JSON.parse(cached) as Profile);
          setStale(true);
        } catch {
          // Corrupt cache: ignore it, the server call below is authoritative.
        }
      }
      if (savedChild && !cancelled) setActiveChildId(Number(savedChild));

      try {
        const fresh = await getProfile();
        if (!cancelled) await remember(fresh);
      } catch (error) {
        // Only a rejected token ends the session. Anything else — no signal,
        // a server restart — leaves the cached view in place.
        if (error instanceof ApiError && error.isUnauthorised) {
          if (!cancelled) await forget();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [remember, forget]);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const next = await apiSignIn(identifier, password);
      await remember(next);
      setActiveChildId(next.children[0]?.id ?? null);
    },
    [remember],
  );

  const activate = useCallback(
    async (input: Parameters<typeof apiActivate>[0]) => {
      const next = await apiActivate(input);
      await remember(next);
      setActiveChildId(next.children[0]?.id ?? null);
    },
    [remember],
  );

  const linkChild = useCallback(
    async (registrationNo: string, code: string) => {
      await apiLinkChild(registrationNo, code);
      // The profile carries the child list, so it has to be re-read rather
      // than patched — the new daughter must appear in the picker at once.
      await remember(await getProfile());
    },
    [remember],
  );

  const signOut = useCallback(async () => {
    await apiSignOut();
    await forget();
  }, [forget]);

  const selectChild = useCallback((studentId: number) => {
    setActiveChildId(studentId);
    AsyncStorage.setItem(ACTIVE_CHILD_KEY, String(studentId)).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    try {
      await remember(await getProfile());
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorised) await forget();
      else throw error;
    }
  }, [remember, forget]);

  const value = useMemo<SessionValue>(() => {
    const kids = profile?.children ?? [];
    // A remembered child who has left the school must not strand the app on
    // an id that no longer exists.
    const activeChild = kids.find((c) => c.id === activeChildId) ?? kids[0] ?? null;
    const status = profile?.school?.status;

    return {
      loading,
      profile,
      activeChild,
      stale,
      locked: status === 'suspended' || status === 'closed',
      lockReason: profile?.school?.suspendedReason ?? null,
      signIn,
      activate,
      linkChild,
      signOut,
      selectChild,
      refresh,
    };
  }, [
    loading, profile, stale, activeChildId,
    signIn, activate, linkChild, signOut, selectChild, refresh,
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
