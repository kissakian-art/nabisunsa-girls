import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db, isMockMode } from '../firebase';
import { User, SchoolConfig } from '../../types';
import { MOCK_USERS, MOCK_SCHOOL_CONFIG } from '../../scripts/seedData';
import AsyncStorage from '@react-native-async-storage/async-storage';

// In-memory subscription list for mock school config events
const configListeners = new Set<(config: SchoolConfig | null) => void>();

/**
 * Retrieves the profile of a registered user by their UID.
 */
export async function getUserProfile(uid: string): Promise<User | null> {
  if (isMockMode) {
    try {
      const stored = await AsyncStorage.getItem(`mock_user_${uid}`);
      if (stored) {
        return JSON.parse(stored) as User;
      }
      const found = MOCK_USERS.find(u => u.uid === uid);
      if (found) {
        await AsyncStorage.setItem(`mock_user_${uid}`, JSON.stringify(found));
        return found;
      }
      return null;
    } catch (error) {
      console.error('Error fetching mock user profile:', error);
      return null;
    }
  }

  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data() as User;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
}

/**
 * Creates or updates a user profile on Firestore.
 */
export async function saveUserProfile(uid: string, profileData: Partial<User>): Promise<void> {
  if (isMockMode) {
    try {
      const existing = await getUserProfile(uid) || { uid } as User;
      const updated = { ...existing, ...profileData, updatedAt: new Date() };
      await AsyncStorage.setItem(`mock_user_${uid}`, JSON.stringify(updated));
      return;
    } catch (error) {
      console.error('Error saving mock user profile:', error);
      return;
    }
  }

  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, profileData, { merge: true });
  } catch (error) {
    console.error('Error saving user profile:', error);
    throw error;
  }
}

/**
 * Subscribes to real-time updates for Nabisunsa's school configuration.
 * This is crucial to dynamically lock the app if `isActive` is set to false.
 */
export function watchSchoolConfig(
  schoolId: string,
  onUpdate: (config: SchoolConfig | null) => void
): () => void {
  if (isMockMode) {
    configListeners.add(onUpdate);
    
    // Initial fetch from storage
    AsyncStorage.getItem(`mock_school_${schoolId}`).then((stored) => {
      if (stored) {
        onUpdate(JSON.parse(stored));
      } else {
        AsyncStorage.setItem(`mock_school_${schoolId}`, JSON.stringify(MOCK_SCHOOL_CONFIG)).then(() => {
          onUpdate(MOCK_SCHOOL_CONFIG);
        });
      }
    }).catch((e) => {
      console.error('Error loading mock school config:', e);
      onUpdate(MOCK_SCHOOL_CONFIG);
    });

    return () => {
      configListeners.delete(onUpdate);
    };
  }

  const schoolRef = doc(db, 'schools', schoolId);
  
  return onSnapshot(
    schoolRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data() as SchoolConfig);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.error('Error listening to school configuration:', error);
    }
  );
}

/**
 * Updates the school activation status (Super-Admin / Developer function).
 */
export async function toggleSchoolActivation(
  schoolId: string,
  isActive: boolean,
  disabledReason?: string
): Promise<void> {
  if (isMockMode) {
    try {
      const stored = await AsyncStorage.getItem(`mock_school_${schoolId}`);
      const current = stored ? JSON.parse(stored) : MOCK_SCHOOL_CONFIG;
      const updated = {
        ...current,
        isActive,
        disabledReason: disabledReason || '',
        updatedAt: new Date(),
      };
      await AsyncStorage.setItem(`mock_school_${schoolId}`, JSON.stringify(updated));
      
      // Instantly notify active observers
      configListeners.forEach(listener => listener(updated));
      return;
    } catch (error) {
      console.error('Error toggling mock school activation status:', error);
      return;
    }
  }

  try {
    const schoolRef = doc(db, 'schools', schoolId);
    await updateDoc(schoolRef, {
      isActive,
      disabledReason: disabledReason || '',
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error toggling school activation status:', error);
    throw error;
  }
}

/**
 * Retrieves the list of streams configured for the school.
 */
export async function getSchoolStreams(schoolId: string): Promise<string[]> {
  if (isMockMode) {
    try {
      const stored = await AsyncStorage.getItem(`mock_school_streams_${schoolId}`);
      if (stored) {
        return JSON.parse(stored) as string[];
      }
      return ['Blue', 'Red', 'Green'];
    } catch (e) {
      console.error('Error fetching mock school streams:', e);
      return ['Blue', 'Red', 'Green'];
    }
  }

  try {
    const schoolRef = doc(db, 'schools', schoolId);
    const snap = await getDoc(schoolRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && Array.isArray(data.streams)) {
        return data.streams;
      }
    }
    return ['Blue', 'Red', 'Green'];
  } catch (e) {
    console.error('Error fetching school streams:', e);
    return ['Blue', 'Red', 'Green'];
  }
}

/**
 * Saves the list of streams configured for the school.
 */
export async function saveSchoolStreams(schoolId: string, streams: string[]): Promise<void> {
  if (isMockMode) {
    try {
      await AsyncStorage.setItem(`mock_school_streams_${schoolId}`, JSON.stringify(streams));
      return;
    } catch (e) {
      console.error('Error saving mock school streams:', e);
      return;
    }
  }

  try {
    const schoolRef = doc(db, 'schools', schoolId);
    await setDoc(schoolRef, { streams, updatedAt: new Date() }, { merge: true });
  } catch (e) {
    console.error('Error saving school streams:', e);
    throw e;
  }
}

/**
 * Searches the database (Firestore or mock storage) for a student user profile matching a Registration Number.
 */
export async function findStudentProfileByRegNo(regNo: string): Promise<User | null> {
  const targetReg = regNo.trim().toUpperCase();
  if (!targetReg) return null;

  if (isMockMode) {
    try {
      // 1. Scan AsyncStorage keys for mock users
      const allKeys = await AsyncStorage.getAllKeys();
      const userKeys = allKeys.filter(k => k.startsWith('mock_user_'));
      if (userKeys.length > 0) {
        const storedUsers = await AsyncStorage.multiGet(userKeys);
        for (const [_, val] of storedUsers) {
          if (val) {
            const user = JSON.parse(val) as User;
            if (user.registrationNumber?.toUpperCase() === targetReg) {
              return user;
            }
          }
        }
      }

      // 2. Fallback to pre-seeded static array
      const found = MOCK_USERS.find(u => u.registrationNumber?.toUpperCase() === targetReg);
      if (found) {
        return found;
      }
      return null;
    } catch (e) {
      console.error('Error finding mock student by Reg No:', e);
      return null;
    }
  }

  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('registrationNumber', '==', targetReg));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docData = snap.docs[0].data();
      return docData as User;
    }
    return null;
  } catch (error) {
    console.error('Error finding student by Reg No:', error);
    throw error;
  }
}

