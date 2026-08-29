import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useColorScheme, ActivityIndicator, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { Colors } from '../constants/theme';
import { SessionProvider, useSession } from '../services/session';
import { registerForPushNotifications, setupNotificationChannel } from '../services/notifications';

/**
 * Everything below the provider: the session decides what a user may see.
 *
 * This used to listen to Firebase Auth and to a live Firestore document for
 * the school's on/off switch. Both now come from the school's own server —
 * the switch in particular has to, because a kill switch a client evaluates
 * is a kill switch anyone can patch out. The server refuses to serve marks
 * to a suspended school; this screen only explains why.
 */
function RootNavigator() {
  const scheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { loading, profile, locked } = useSession();

  // Push notifications. Independent of who is signed in: the permission
  // prompt and the Android channels belong to the app, not the session.
  const notificationResponseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    setupNotificationChannel();
    registerForPushNotifications();

    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        if (data?.screen === 'billboard') router.replace('/(tabs)');
      });

    return () => notificationResponseListener.current?.remove();
  }, []);

  // Navigation guard.
  useEffect(() => {
    if (loading) return;

    const section = segments[0];
    const inApp = section === '(tabs)';
    const inLockScreen = section === 'lock';
    const signedIn = !!profile;

    // A switched-off school: every signed-in route becomes the lock screen,
    // which says who to call. Signing out is still allowed.
    if (signedIn && locked) {
      if (!inLockScreen) router.replace('/lock');
      return;
    }
    if (inLockScreen && (!signedIn || !locked)) {
      router.replace(signedIn ? '/(tabs)' : '/');
      return;
    }

    if (!signedIn) {
      // Signed out: the login screen, and the activation screen a parent
      // reaches from it with the slip the school gave them.
      if (section && section !== 'activate') router.replace('/');
      return;
    }

    // Signed in: the login screen is not somewhere to go back to.
    if (!section) router.replace('/(tabs)');
    else if (!inApp && (section === 'admin' || section === 'developer')) {
      // Staff tools are the web portal's job. Nothing in this app should
      // reach them, including a deep link.
      router.replace('/(tabs)');
    }
  }, [loading, profile, locked, segments]);

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
        <Stack.Screen name="activate" />
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

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
