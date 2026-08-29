import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
// @ts-ignore — present in the native build of firebase/auth only.
import { getReactNativePersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// standard Firebase client configuration using Expo environment variables
const hasEnv = !!process.env.EXPO_PUBLIC_FIREBASE_API_KEY;

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'mock-api-key-nabisunsa',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'mock-auth-domain-nabisunsa',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'nabisunsa-girls-secondary',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'mock-storage-bucket-nabisunsa',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'mock-sender-id-nabisunsa',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || 'mock-app-id-nabisunsa',
};

const isMockMode = !hasEnv;

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

console.log('[Firebase Diagnostics] Loaded Config:', {
  apiKeyLength: firebaseConfig.apiKey?.length,
  apiKeyPrefix: firebaseConfig.apiKey?.substring(0, 8),
  apiKeySuffix: firebaseConfig.apiKey?.substring(firebaseConfig.apiKey.length - 4),
  projectId: firebaseConfig.projectId,
  isMockMode: isMockMode || firebaseConfig.apiKey === 'mock-api-key-nabisunsa'
});

// Auth, only far enough to keep the remaining Firebase screens importable.
//
// `getReactNativePersistence` does not exist in the web build of
// firebase/auth, and calling it there crashed the whole bundle — every
// screen, including the ones that no longer touch Firebase at all. Nothing
// signs into Firebase Auth any more (the session is a token from the
// school's own server), so this only has to construct without throwing.
const auth =
  typeof getReactNativePersistence === 'function'
    ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
    : getAuth(app);

// Initialize Firestore with robust local caching for offline capabilities 
// (essential to make students/parents see marks even without internet!)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

const storage = getStorage(app);

export { app, auth, db, storage, isMockMode };
