import { Tabs } from 'expo-router';
import { Platform, useColorScheme } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

/**
 * Three tabs, which is the whole app.
 *
 * It used to be four — Billboard, Career JAB, Classroom, Messages — over a
 * learning management system: teachers posting lessons and assignments,
 * students submitting them. That was cut. It contradicted the one promise
 * the school is actually buying ("your teachers do nothing differently"),
 * and it had already stopped working: those screens read the signed-in user
 * from Firebase Auth, which nothing signs into any more.
 *
 * What is left is what a family opens the app for: how is she doing, the
 * full card, and someone to ask.
 */
export default function TabLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: scheme === 'dark' ? '#8E9AA7' : '#B9C2CE',
        tabBarStyle: {
          backgroundColor: scheme === 'dark' ? '#0E1B30' : '#0F2042',
          borderTopWidth: 1.5,
          borderTopColor: colors.gold,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 30 : 10,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="home" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="report-card"
        options={{
          title: 'Report card',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="file-alt" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ai-chat"
        options={{
          title: 'Advisor',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="comments" size={size - 2} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
