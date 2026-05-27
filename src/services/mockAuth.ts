import AsyncStorage from '@react-native-async-storage/async-storage';
import { MOCK_USERS } from '../scripts/seedData';
import { User } from '../types';

type AuthListener = (user: User | null) => void;
const listeners = new Set<AuthListener>();
let currentUser: User | null = null;
let initialized = false;

export const mockAuth = {
  /**
   * Subscribes to changes in authentication state (matching onAuthStateChanged)
   */
  subscribe(listener: AuthListener) {
    listeners.add(listener);
    
    if (initialized) {
      listener(currentUser);
    } else {
      this.init().then(() => listener(currentUser));
    }
    
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Loads any stored mock session on startup
   */
  async init() {
    if (initialized) return currentUser;
    try {
      const stored = await AsyncStorage.getItem('mock_user_session');
      if (stored) {
        currentUser = JSON.parse(stored) as User;
      }
    } catch (e) {
      console.error('Failed to restore mock auth session:', e);
    }
    initialized = true;
    return currentUser;
  },

  /**
   * Authenticates credentials against the preloaded Nabisunsa user directory
   */
  async signIn(email: string, password?: string): Promise<User> {
    await this.init();
    const cleanEmail = email.trim().toLowerCase();
    
    // Support generic 'student@nabisunsa.ac.ug' matching Sarah (A-Level)
    let searchEmail = cleanEmail;
    if (cleanEmail === 'student@nabisunsa.ac.ug') {
      searchEmail = 'student_a@nabisunsa.ac.ug';
    }

    const found = MOCK_USERS.find(u => u.email.toLowerCase() === searchEmail);
    if (!found) {
      throw { code: 'auth/user-not-found', message: 'User profile not found in directory.' };
    }
    
    if (password && password !== 'nabisunsa123') {
      throw { code: 'auth/wrong-password', message: 'Incorrect password for portal access.' };
    }

    currentUser = found;
    await AsyncStorage.setItem('mock_user_session', JSON.stringify(found));
    
    // Notify listeners
    listeners.forEach(l => l(currentUser));
    return found;
  },

  /**
   * Terminate active mock session
   */
  async signOut() {
    currentUser = null;
    await AsyncStorage.removeItem('mock_user_session');
    listeners.forEach(l => l(null));
  },

  getCurrentUser() {
    return currentUser;
  }
};
