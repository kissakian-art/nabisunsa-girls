import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useColorScheme, Platform } from 'react-native';
import { Colors, Spacing, MaxContentWidth } from '../../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { auth } from '../../services/firebase';
import { getUserProfile } from '../../services/db/users';
import { User } from '../../types';
import { StatusBar } from 'expo-status-bar';

interface ChatItem {
  id: string;
  name: string;
  role: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
}

export default function ChatScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [chats, setChats] = useState<ChatItem[]>([]);

  useEffect(() => {
    async function loadChatRoster() {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      try {
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);

        // Load mock chats representing administrative & academic contacts
        const mockChatsList: ChatItem[] = [
          {
            id: 'c1',
            name: 'Mr. Okello James',
            role: 'Physics & Math Teacher',
            lastMessage: 'Joanita has performed excellently in Newton\'s equations coursework. Keep up this support!',
            time: '09:40 AM',
            unreadCount: 1
          },
          {
            id: 'c2',
            name: 'Hajati Zaminah',
            role: 'School Headmistress',
            lastMessage: 'Assalamu alaikum. We have approved the term report cards. They are now downloadable.',
            time: 'Yesterday',
            unreadCount: 0
          },
          {
            id: 'c3',
            name: 'Accounts Administrative Desk',
            role: 'Bursar / School Fees Office',
            lastMessage: 'Payment receipt for S5 Term 1 school fees registered successfully. Thank you.',
            time: '12 May',
            unreadCount: 0
          }
        ];
        setChats(mockChatsList);
      } catch (e) {
        console.error('Error loading chats:', e);
      } finally {
        setLoading(false);
      }
    }

    loadChatRoster();
  }, []);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* Header Bar */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Portal Inbox</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Secure messaging portal connecting Nabisunsa parents and students with school administrators and class teachers.
        </Text>
      </View>

      {/* Chat Contacts List */}
      <View style={styles.rosterSection}>
        {chats.map((chat) => (
          <TouchableOpacity
            key={chat.id}
            style={[styles.chatRow, { backgroundColor: colors.backgroundElement, borderBottomColor: colors.gold + '1F' }]}
            onPress={() => {
              // Custom action or chat open alert
              if (Platform.OS === 'web') {
                alert(`Opening secure message thread with ${chat.name}...`);
              }
            }}
          >
            {/* Roster Avatar shield */}
            <View style={[styles.avatar, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="user-tie" size={14} color={colors.gold} />
            </View>

            {/* Chat preview details */}
            <View style={styles.chatDetails}>
              <View style={styles.chatMetaRow}>
                <Text style={[styles.chatName, { color: colors.text }]}>{chat.name}</Text>
                <Text style={[styles.chatTime, { color: colors.textSecondary }]}>{chat.time}</Text>
              </View>
              
              <Text style={[styles.chatRole, { color: colors.gold }]}>{chat.role}</Text>
              
              <Text style={[styles.lastMessage, { color: colors.textSecondary }]} numberOfLines={2}>
                {chat.lastMessage}
              </Text>
            </View>

            {/* Unread indicator */}
            {chat.unreadCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: colors.gold }]}>
                <Text style={styles.unreadCountText}>{chat.unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.infoBanner}>
        <FontAwesome5 name="lock" size={10} color={colors.textSecondary} style={{ marginRight: 6 }} />
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          All communications are encrypted and monitored under Nabisunsa portal security guidelines.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
    paddingBottom: Spacing.five,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginBottom: Spacing.four,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  rosterSection: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.three,
  },
  chatDetails: {
    flex: 1,
  },
  chatMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  chatName: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  chatTime: {
    fontSize: 10,
    fontWeight: '500',
  },
  chatRole: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  lastMessage: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  unreadBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.two,
  },
  unreadCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.five,
    paddingHorizontal: Spacing.three,
  },
  infoText: {
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 14,
  },
});
