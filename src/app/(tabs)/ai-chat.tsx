/**
 * The academic advisor.
 *
 * No context is assembled here. This screen used to build the advisor's
 * entire system prompt on the phone — the student's grades, her combination,
 * and a hard-coded table of university cut-off points. The cut-offs moved
 * every year and were going stale inside an app nobody updates, and anything
 * the app can compose, a modified app can compose differently: it could
 * claim to be another student.
 *
 * Both now live on the server, which builds the prompt from the child's own
 * released results. This screen sends a question and shows an answer.
 */

import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Radius, Space, Type, usePalette } from '../../components/ui';
import { MaxContentWidth } from '../../constants/theme';
import { useSession } from '../../services/session';
import { askAdvisor } from '../../services/api';

interface Message {
  id: string;
  from: 'parent' | 'advisor';
  text: string;
}

const id = () => Math.random().toString(36).slice(2);

export default function AdvisorScreen() {
  const c = usePalette();
  const params = useLocalSearchParams();
  const initialPrompt = params.initialPrompt as string | undefined;
  const { activeChild } = useSession();

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef<ScrollView>(null);

  const her = activeChild?.firstName;

  useEffect(() => {
    setMessages([
      {
        id: 'greeting',
        from: 'advisor',
        text: her
          ? `Hello. I can talk about ${her}'s results — how she is doing, where she is improving, and what to think about next.`
          : 'Hello. What would you like to know?',
      },
    ]);
  }, [her]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;

    setMessages((prev) => [...prev, { id: id(), from: 'parent', text: question }]);
    setDraft('');
    setSending(true);
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80);

    try {
      // The greeting is ours, not part of the conversation. The child is
      // named so a parent with two daughters gets an answer about the one on
      // screen; the server still checks that she is theirs.
      const history = messages
        .filter((m) => m.id !== 'greeting')
        .map((m) => ({ role: m.from === 'parent' ? ('user' as const) : ('model' as const), text: m.text }));

      const { reply } = await askAdvisor(question, history, activeChild?.id);
      setMessages((prev) => [...prev, { id: id(), from: 'advisor', text: reply }]);
    } catch (e: any) {
      // The server never returns provider detail, so whatever arrives here is
      // already safe to show a parent.
      setMessages((prev) => [
        ...prev,
        {
          id: id(),
          from: 'advisor',
          text: e?.message || 'I could not reach the school right now. Please try again shortly.',
        },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  useEffect(() => {
    if (initialPrompt && messages.length === 1) send(initialPrompt);
  }, [initialPrompt, messages.length]);

  const suggestions = [
    'Which subjects should she focus on this term?',
    'How has she improved compared with last term?',
    'What kind of courses suit her strengths?',
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />

      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.backgroundElement }]}>
        <View style={styles.headerInner}>
          <Text style={[Type.overline, { color: c.gold }]}>ACADEMIC ADVISOR</Text>
          <Text style={[Type.title, { color: c.text, marginTop: Space.hair }]}>
            {her ? `About ${her}` : 'Ask a question'}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={styles.thread}
      >
        <View style={styles.column}>
          {messages.map((message) => {
            const fromAdvisor = message.from === 'advisor';
            return (
              <View
                key={message.id}
                style={[styles.row, fromAdvisor ? styles.left : styles.right]}
              >
                <View
                  style={[
                    styles.bubble,
                    fromAdvisor
                      ? { backgroundColor: c.backgroundElement, borderColor: c.border, borderWidth: 1 }
                      : { backgroundColor: c.primary },
                  ]}
                >
                  <Text
                    style={[
                      Type.body,
                      { color: fromAdvisor ? c.text : c.onPrimary },
                    ]}
                  >
                    {message.text}
                  </Text>
                </View>
              </View>
            );
          })}

          {sending && (
            <View style={[styles.row, styles.left]}>
              <View
                style={[
                  styles.bubble,
                  styles.thinking,
                  { backgroundColor: c.backgroundElement, borderColor: c.border, borderWidth: 1 },
                ]}
              >
                <ActivityIndicator size="small" color={c.gold} />
              </View>
            </View>
          )}

          {/* Only before the first question: afterwards they are clutter. */}
          {messages.length === 1 && (
            <View style={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion}
                  onPress={() => send(suggestion)}
                  style={[styles.suggestion, { borderColor: c.border, backgroundColor: c.backgroundElement }]}
                >
                  <Text style={[Type.body, { color: c.text }]}>{suggestion}</Text>
                  <FontAwesome5 name="arrow-right" size={11} color={c.gold} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.composer, { borderTopColor: c.border, backgroundColor: c.backgroundElement }]}>
        <View style={[styles.composerInner]}>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
            placeholder={her ? `Ask about ${her}…` : 'Ask a question…'}
            placeholderTextColor={c.textSecondary + '99'}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => send(draft)}
            multiline
          />
          <TouchableOpacity
            onPress={() => send(draft)}
            disabled={sending || !draft.trim()}
            style={[
              styles.send,
              { backgroundColor: draft.trim() ? c.primary : c.border },
            ]}
          >
            <FontAwesome5 name="paper-plane" size={14} color={c.onPrimary} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: 1, paddingVertical: Space.gap, alignItems: 'center' },
  headerInner: { width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Space.gap },
  thread: { padding: Space.gap, alignItems: 'center' },
  column: { width: '100%', maxWidth: MaxContentWidth },
  row: { flexDirection: 'row', marginBottom: Space.base },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  bubble: {
    // The width cap is the point: without it a long answer runs off the edge
    // of the screen, which is what this used to do.
    maxWidth: '85%',
    borderRadius: Radius.card,
    paddingVertical: Space.base,
    paddingHorizontal: Space.gap,
  },
  thinking: { paddingVertical: Space.gap, paddingHorizontal: Space.section },
  suggestions: { marginTop: Space.snug, gap: Space.snug },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.base,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: Space.base,
    paddingHorizontal: Space.gap,
  },
  composer: { borderTopWidth: 1, paddingVertical: Space.base, alignItems: 'center' },
  composerInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.snug,
    paddingHorizontal: Space.gap,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.base,
    paddingVertical: Space.base,
    fontSize: 15,
    maxHeight: 120,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
