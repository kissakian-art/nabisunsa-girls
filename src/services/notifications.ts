import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The accent the notification tray shows. Per-school branding for this
// belongs in app.config.js at build time, not here.
const ACCENT = '#C9A84C';

const PUSH_TOKEN_KEY = 'midway_push_token';

/**
 * Configure how notifications behave when the app is in the foreground.
 * Shows alert + sound + badge even while the user is inside the app.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Creates the Android notification channel for school announcements.
 * This is required on Android 8+ for notifications to appear.
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('announcements', {
      name: 'School Announcements',
      description: 'Official announcements from the school',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: ACCENT,
      sound: 'default',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync('academic', {
      name: 'Academic Updates',
      description: 'Marks published, report cards, assignment grades',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 200, 200],
      lightColor: ACCENT,
      sound: 'default',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });
  }
}

/**
 * Requests notification permissions from the user.
 * Returns the Expo push token if permissions are granted.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Notifications only work on physical devices for remote push
  if (!Device.isDevice && Platform.OS !== 'web') {
    console.log('[Notifications] Running on simulator — local notifications will still work.');
  }

  // Check existing permission status
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // If not yet determined, request permission
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission not granted by user.');
    return null;
  }

  // Get and store the push token for future remote push capability
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: undefined, // Uses the project ID from app.json automatically
    });
    const token = tokenResponse.data;
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    console.log('[Notifications] Push token registered:', token);
    return token;
  } catch (error) {
    console.log('[Notifications] Could not get push token (expected in dev):', error);
    return null;
  }
}

export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    // Badge count may not be supported on all platforms
    console.log('[Notifications] Could not set badge count:', error);
  }
}

/**
 * Clears all delivered notifications from the notification panel.
 */
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
  await setBadgeCount(0);
}
