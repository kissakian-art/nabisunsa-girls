import { Tabs } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { usePalette } from '../../components/ui';

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
  const c = usePalette();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.gold,
        tabBarInactiveTintColor: '#8FA0B8',
        tabBarStyle: {
          backgroundColor: c.primary,
          borderTopWidth: 1,
          borderTopColor: c.gold,
          // Height and padding together, and generous: an icon, a label
          // beneath it, and whatever safe-area inset the device adds on top.
          // Too little and the navigator drops the labels entirely; too
          // little in a different way and they are clipped by the screen
          // edge. Both were seen before this settled.
          height: 78,
          paddingTop: 10,
          paddingBottom: 14,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
        tabBarLabelPosition: 'below-icon',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="home" size={size - 4} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="report-card"
        options={{
          title: 'Report card',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="file-alt" size={size - 4} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ai-chat"
        options={{
          title: 'Advisor',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="comments" size={size - 4} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
