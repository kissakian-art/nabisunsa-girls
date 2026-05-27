import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Nabisunsa school brand colors
const NABISUNSA_GOLD = '#C9A84C';

// AsyncStorage keys
const NOTIFIED_ANNOUNCEMENTS_KEY = 'nabisunsa_notified_announcements';
const PUSH_TOKEN_KEY = 'nabisunsa_push_token';

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
      description: 'Official announcements from Nabisunsa Girls\' Secondary School',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: NABISUNSA_GOLD,
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
      lightColor: NABISUNSA_GOLD,
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

/**
 * Fires a local notification that appears in the phone's notification panel.
 * Like WhatsApp — shows immediately with title, body, sound, and vibration.
 */
export async function scheduleAnnouncementNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<string> {
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
      data: { screen: 'billboard', ...data },
      ...(Platform.OS === 'android' && { channelId: 'announcements' }),
    },
    trigger: null, // null = fire immediately
  });

  console.log(`[Notifications] Fired announcement notification: ${title} (ID: ${notificationId})`);
  return notificationId;
}

/**
 * Fires an academic notification (marks published, grades, etc.)
 */
export async function scheduleAcademicNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<string> {
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
      data: { screen: 'billboard', ...data },
      ...(Platform.OS === 'android' && { channelId: 'academic' }),
    },
    trigger: null,
  });

  console.log(`[Notifications] Fired academic notification: ${title} (ID: ${notificationId})`);
  return notificationId;
}

/**
 * Checks which announcements have already been notified to avoid duplicates.
 * Returns the set of announcement IDs that have already triggered notifications.
 */
export async function getNotifiedAnnouncementIds(): Promise<Set<string>> {
  try {
    const stored = await AsyncStorage.getItem(NOTIFIED_ANNOUNCEMENTS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (error) {
    console.error('[Notifications] Error reading notified IDs:', error);
  }
  return new Set();
}

/**
 * Marks an announcement as "notified" so it won't trigger a duplicate notification.
 */
export async function markAnnouncementAsNotified(announcementId: string): Promise<void> {
  try {
    const existing = await getNotifiedAnnouncementIds();
    existing.add(announcementId);
    // Keep only the last 100 IDs to prevent unbounded storage growth
    const trimmed = [...existing].slice(-100);
    await AsyncStorage.setItem(NOTIFIED_ANNOUNCEMENTS_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('[Notifications] Error saving notified ID:', error);
  }
}

/**
 * Processes a list of announcements and fires notifications for any new ones.
 * This is the main integration point called from the dashboard.
 */
export async function notifyNewAnnouncements(
  announcements: { id: string; title: string; body: string; isPinned?: boolean }[]
): Promise<number> {
  const alreadyNotified = await getNotifiedAnnouncementIds();
  let newCount = 0;

  for (const ann of announcements) {
    if (!alreadyNotified.has(ann.id)) {
      // Strip emoji from title for cleaner notification display
      const cleanTitle = ann.title.replace(/[\u{1F4E2}\u{1F4DD}\u{1F54C}\u{1F3C6}\u{1F514}]/gu, '').trim();
      
      await scheduleAnnouncementNotification(
        `🏫 ${cleanTitle}`,
        ann.body.length > 150 ? ann.body.substring(0, 147) + '...' : ann.body,
        { announcementId: ann.id, isPinned: ann.isPinned }
      );
      await markAnnouncementAsNotified(ann.id);
      newCount++;
    }
  }

  if (newCount > 0) {
    console.log(`[Notifications] Fired ${newCount} new announcement notification(s).`);
  }

  return newCount;
}

/**
 * Sets the app badge count (iOS & Android 8+).
 */
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
