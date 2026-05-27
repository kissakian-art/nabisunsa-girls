import { Tabs } from 'expo-router';
import { useColorScheme, Platform } from 'react-native';
import { Colors } from '../../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';

export default function TabLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: scheme === 'dark' ? '#8E9AA7' : '#5A6578',
        tabBarStyle: {
          backgroundColor: scheme === 'dark' ? '#0E1B30' : '#0F2042', // Rich Navy
          borderTopWidth: 1.5,
          borderTopColor: colors.gold, // Gold divider
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 30 : 10,
          paddingTop: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.1,
          shadowRadius: 5,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Billboard',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="chalkboard-teacher" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="career"
        options={{
          title: 'Career JAB',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="graduation-cap" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="classroom"
        options={{
          title: 'Classroom',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="video" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome5 name="comments" size={size - 2} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
