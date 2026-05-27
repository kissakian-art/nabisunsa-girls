import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useColorScheme, ActivityIndicator, View, StyleSheet } from 'react-native';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, isMockMode } from '../services/firebase';
import { mockAuth } from '../services/mockAuth';
import { watchSchoolConfig, getUserProfile } from '../services/db/users';
import { SchoolConfig } from '../types';
import { Colors } from '../constants/theme';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications, setupNotificationChannel } from '../services/notifications';

export default function RootLayout() {
  const scheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  // Auth and Subscription State
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. Subscribe to Authentication State
  useEffect(() => {
    if (isMockMode) {
      const unsubscribeMock = mockAuth.subscribe(async (mockUser) => {
        setUser(mockUser as any);
        if (mockUser) {
          setUserRole(mockUser.role || 'student_parent');
        } else {
          setUserRole(null);
        }
        setLoading(false);
      });
      return () => unsubscribeMock();
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const profile = await getUserProfile(currentUser.uid);
          setUserRole(profile?.role || 'student_parent');
        } catch (e) {
          console.error('Error getting user profile:', e);
          setUserRole('student_parent');
        }
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Subscribe to Nabisunsa School Configuration for dynamic lock control
  useEffect(() => {
    const unsubscribeConfig = watchSchoolConfig('nabisunsa_girls', (config) => {
      setSchoolConfig(config);
    });

    return () => unsubscribeConfig();
  }, []);

  // 2.5. Initialize Push Notifications on app startup
  const notificationResponseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Create Android notification channels (announcements + academic)
    setupNotificationChannel();

    // Request notification permissions (shows OS dialog on first launch)
    registerForPushNotifications();

    // Listen for notification taps — navigate to Billboard when tapped
    notificationResponseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('[Notifications] User tapped notification:', data);
      // Navigate to the billboard/home tab when a notification is tapped
      if (data?.screen === 'billboard') {
        router.replace('/(tabs)');
      }
    });

    return () => {
      if (notificationResponseListener.current) {
        notificationResponseListener.current.remove();
      }
    };
  }, []);

  // 3. Dynamic Router Navigation Guards
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const inLockScreen = segments[0] === 'lock';
    const inDevConsole = segments[0] === 'developer';
    const inAdminGroup = segments[0] === 'admin';

    // A. App Subscription Lock: Check if school is disabled
    if (schoolConfig && !schoolConfig.isActive) {
      // If the school is disabled, force redirect to /lock screen immediately
      // Exception: Allow Developer Role (system_owner) to access /developer to reactivate!
      if (!inLockScreen && !inDevConsole && userRole !== 'system_owner') {
        router.replace('/lock');
      }
      return;
    }

    // If school is active and user is in lock screen, release the lock
    if (schoolConfig && schoolConfig.isActive && inLockScreen) {
      if (user) {
        router.replace('/(tabs)');
      } else {
        router.replace('/');
      }
      return;
    }

    // B. Authentication Guard
    if (!user) {
      // If not logged in, force redirect to corporate login page (root index.tsx)
      if (inAuthGroup || inDevConsole || inAdminGroup || inLockScreen) {
        router.replace('/');
      }
    } else {
      // If logged in, prevent visiting login page (index.tsx)
      if (!segments || !segments[0]) {
        router.replace('/(tabs)');
      }
    }
  }, [user, userRole, schoolConfig, loading, segments]);

  // Loading Screen: Elegant champagne ivory backdrop with Crested Gold spinner
  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.gold} />
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="lock" />
        <Stack.Screen name="ai-chat" options={{ presentation: 'modal' }} />
        <Stack.Screen name="report-card" />
        <Stack.Screen name="developer/index" />
        <Stack.Screen name="admin/marks-entry" />
        <Stack.Screen name="admin/post-assignment" />
        <Stack.Screen name="admin/post-lesson" />
        <Stack.Screen name="course/[id]" />
        <Stack.Screen name="lessons/[id]" />
      </Stack>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
