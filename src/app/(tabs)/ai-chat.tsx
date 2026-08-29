import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, useColorScheme, Platform, KeyboardAvoidingView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, MaxContentWidth } from '../../constants/theme';
import { useSession } from '../../services/session';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { askAdvisor } from '../../services/api';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export default function AiChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialPrompt = params.initialPrompt as string;

  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const { activeChild } = useSession();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  // No context is assembled here any more.
  //
  // This screen used to build the advisor's entire system prompt on the
  // phone — the student's grades, her combination, and a hard-coded table of
  // university cut-off points. Two things were wrong with that. The cut-offs
  // move every year and were quietly going stale in an app nobody updates,
  // and anything the app can compose, the app can be made to compose
  // differently: a modified client could claim to be another student.
  //
  // Both now live on the server, which builds the prompt from the child's own
  // released results. The app sends a question and nothing else.
  useEffect(() => {
    setMessages([
      {
        id: '1',
        sender: 'ai',
        text: activeChild
          ? `Hello. I can talk about ${activeChild.firstName}'s results — how she is doing, where she is improving, and what to think about next. What would you like to know?`
          : 'Hello. What would you like to know?',
        timestamp: new Date(),
      },
    ]);
  }, [activeChild]);

  // Handle trigger of initialPrompt if passed from course details screen
  useEffect(() => {
    if (initialPrompt && messages.length === 1) {
      sendMessage(initialPrompt);
    }
  }, [initialPrompt, messages.length]);

  // Unified sending mechanism
  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || sending) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setSending(true);

    // Scroll to bottom
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // The advisor runs on the server. The app sends only the question and
      // the conversation so far — who the student is, what her marks are, and
      // what the advisor may say are all decided server-side.
      //
      // This used to call Gemini directly with EXPO_PUBLIC_GEMINI_API_KEY,
      // which ships inside the APK and can be read by anyone who downloads it.
      const history = messages
        .slice(1) // the opening greeting is ours, not part of the conversation
        .map(m => ({ role: m.sender === 'user' ? 'user' as const : 'model' as const, text: m.text }));

      // The child is named so a parent with two daughters gets an answer
      // about the one on screen. The server still checks that she is theirs.
      const { reply } = await askAdvisor(textToSend, history, activeChild?.id);

      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        sender: 'ai',
        text: reply,
        timestamp: new Date(),
      }]);
    } catch (e: any) {
      // Say something a parent can act on. The server never returns provider
      // detail, so whatever arrives here is already safe to show.
      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        sender: 'ai',
        text: e?.message || 'I could not reach the school right now. Please try again shortly.',
        timestamp: new Date(),
      }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* Nav Bar */}
      <View style={[styles.navBar, { borderBottomColor: colors.gold + '40', backgroundColor: colors.backgroundElement }]}>
        <TouchableOpacity style={[styles.backBtn, { borderColor: colors.gold }]} onPress={() => router.back()}>
          <FontAwesome5 name="arrow-left" size={14} color={colors.gold} />
        </TouchableOpacity>
        <View style={styles.navTitleWrapper}>
          <Text style={[styles.navTitle, { color: colors.text }]}>Academic advisor</Text>
          <Text style={[styles.navSub, { color: colors.gold }]}>
            {activeChild ? `About ${activeChild.firstName}` : ''}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Suggested Chips (Quick-question actions) */}
      {messages.length === 1 && (
        <View style={styles.chipsSection}>
          <Text style={[styles.chipsTitle, { color: colors.gold }]}>Suggested Inquiries:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            <TouchableOpacity 
              style={[styles.suggestChip, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
              onPress={() => sendMessage('Which subjects should she focus on this term?')}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>Where to focus?</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.suggestChip, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
              onPress={() => sendMessage('How has she improved compared with last term?')}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>Is she improving?</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.suggestChip, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
              onPress={() => sendMessage('What kind of courses suit her strengths?')}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>What suits her?</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Messaging Area */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.messagesScroll}
        contentContainerStyle={styles.messagesContainer}
      >
        {messages.map((m) => {
          const isAi = m.sender === 'ai';
          return (
            <View 
              key={m.id} 
              style={[
                styles.bubbleWrapper, 
                isAi ? styles.aiWrapper : styles.userWrapper
              ]}
            >
              {isAi && (
                <View style={[styles.aiAvatar, { backgroundColor: colors.champagne }]}>
                  <FontAwesome5 name="user-graduate" size={10} color={colors.gold} />
                </View>
              )}
              <View 
                style={[
                  styles.bubble, 
                  isAi 
                    ? [styles.aiBubble, { backgroundColor: colors.backgroundElement, borderColor: colors.gold + '40' }]
                    : [styles.userBubble, { backgroundColor: colors.primary }]
                ]}
              >
                <Text 
                  style={[
                    styles.bubbleText, 
                    { color: isAi ? colors.text : '#FFFFFF' }
                  ]}
                >
                  {m.text}
                </Text>
              </View>
            </View>
          );
        })}

        {sending && (
          <View style={[styles.bubbleWrapper, styles.aiWrapper]}>
            <View style={[styles.aiAvatar, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="user-graduate" size={10} color={colors.gold} />
            </View>
            <View style={[styles.bubble, styles.aiBubble, { backgroundColor: colors.backgroundElement, borderColor: colors.gold + '40', paddingVertical: 12 }]}>
              <ActivityIndicator size="small" color={colors.gold} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Form Entry */}
      <View style={[styles.inputForm, { borderTopColor: colors.gold + '40', backgroundColor: colors.backgroundElement }]}>
        <TextInput
          style={[styles.inputField, { color: colors.text, backgroundColor: colors.background, borderColor: colors.gold }]}
          placeholder="Ask counselor a question e.g. What about Law?"
          placeholderTextColor={colors.textSecondary + '80'}
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity 
          style={[styles.sendBtn, { backgroundColor: colors.primary }]}
          onPress={() => sendMessage(inputText)}
          disabled={sending || !inputText.trim()}
        >
          <FontAwesome5 name="paper-plane" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitleWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  navSub: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 1,
  },
  chipsSection: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  chipsTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.four,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  chipsScroll: {
    paddingHorizontal: Spacing.four,
  },
  suggestChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: Spacing.three,
    marginRight: Spacing.two,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  messagesScroll: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  messagesContainer: {
    paddingVertical: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  bubbleWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.three,
    width: '85%',
  },
  aiWrapper: {
    alignSelf: 'flex-start',
  },
  userWrapper: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  aiAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.two,
    marginTop: 4,
  },
  bubble: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.01,
    shadowRadius: 2,
    elevation: 1,
  },
  aiBubble: {
    borderWidth: 1,
    borderTopLeftRadius: 0,
  },
  userBubble: {
    borderTopRightRadius: 0,
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 18,
  },
  inputForm: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
    alignItems: 'center',
    gap: Spacing.two,
  },
  inputField: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    height: 40,
    paddingHorizontal: Spacing.three,
    fontSize: 13,
    maxHeight: 80,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.1,
    elevation: 2,
  },
});
