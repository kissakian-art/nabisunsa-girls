import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, useColorScheme, Platform, KeyboardAvoidingView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth } from '../services/firebase';
import { getUserProfile } from '../services/db/users';
import { getStudentMarksForTerm } from '../services/db/marks';
import { getCourses } from '../services/db/courses';
import { getRecommendations, RecommendationResult } from '../services/careerAdvisor';
import { User, Marks } from '../types';
import { Colors, Spacing, MaxContentWidth } from '../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { askAdvisor } from '../services/api';

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

  const [loadingContext, setLoadingContext] = useState(true);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [marks, setMarks] = useState<Marks[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationResult[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  // System Prompt for context injection
  const [systemPrompt, setSystemPrompt] = useState('');

  useEffect(() => {
    async function loadStudentContext() {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      try {
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);

        if (profile) {
          const studentMarks = await getStudentMarksForTerm(currentUser.uid, '2026_term1');
          setMarks(studentMarks);

          const coursesList = await getCourses();
          
          let matches: RecommendationResult[] = [];
          
          if (profile.level === 'A-Level') {
            const subjectsMap = studentMarks.reduce((acc, curr) => {
              acc[curr.subjectId] = curr.finalGrade || 'F';
              return acc;
            }, {} as Record<string, string>);

            const uaceGrades = {
              subject1: { id: (profile.subjects || [])[0] || 'a_mathematics', grade: (subjectsMap[(profile.subjects || [])[0]] || 'A') as any },
              subject2: { id: (profile.subjects || [])[1] || 'a_physics', grade: (subjectsMap[(profile.subjects || [])[1]] || 'B') as any },
              subject3: { id: (profile.subjects || [])[2] || 'a_chemistry', grade: (subjectsMap[(profile.subjects || [])[2]] || 'C') as any },
              generalPaperPassed: true,
              subsidiaryPassed: true
            };

            const uceGradesList = Object.entries(profile.uceGrades || {}).map(([subId, gr]) => ({
              subjectId: subId,
              subjectName: subId.replace('o_', '').toUpperCase(),
              grade: gr
            }));

            matches = getRecommendations(uceGradesList, uaceGrades, coursesList);
            setRecommendations(matches);
          }

          // Compile detailed text context to inject as system prompt for Gemini
          const gradesSummary = studentMarks.map(m => `${m.subjectId.replace('o_', '').replace('a_', '').toUpperCase()}: ${m.finalGrade} (${m.finalWeightScore}%)`).join(', ');
          const bestMatches = matches.filter(m => m.eligibility === 'High').map(m => `${m.course.name} at ${m.course.institution}`).slice(0, 3).join(', ');

          const prompt = `
            You are a senior, highly prestigious academic and career advisor at Nabisunsa Girls' Secondary School in Uganda.
            You are advising a student and her parent.
            Student Name: ${profile.displayName}
            Current Class: ${profile.classId} (${profile.level})
            Term 1 Grades: [${gradesSummary}]
            Current A-Level Combination: ${profile.aLevelCombination || 'None (O-Level Student)'}
            Primary University Targets: [${bestMatches || 'Skills certificates recommended'}]

            Ugandan University Admissions Rules Reference:
            1. Makerere University (MUK) & Kyambogo University (KYU) Cut-off Lookups:
               - Admissions are strictly points-based (standard JAB weights).
               - Reference Cut-offs: Makerere Medicine (MAM): 49.7, Pharmacy (PHA): 48.9, Civil Eng (CIV): 49.7, Computer Science (CSC): 43.1. Kyambogo Electrical (BEL): 47.4.
            2. Direct Entry Universities (MUST, Gulu, Busitema, KIU, UCU, UMU, IUIU, IUEA):
               - These universities DO NOT use a points-based cut-off system for direct entries.
               - Instead, they use a Direct Entry System requiring:
                 - Minimum of 2 Principal Passes at UACE (A-Level, Grades A, B, C, D, or E).
                 - Minimum of 5 passes at UCE (O-Level, Grades 1 to 8).
               - If a student meets these UACE and UCE pass conditions, advise them and their parent that they qualify for Direct Entry into these premium universities!

            Your tone must be exceptionally polite, formal, corporate, encouraging, and highly professional.
            Always focus recommendations on the Ugandan higher education system (e.g. Makerere University, Kyambogo, MUBS) or popular vocational centers (Nakawa Vocational, Jinja Catering).
            Acknowledge Nabisunsa Girls' Secondary School's premium standard in all interactions.
          `;
          setSystemPrompt(prompt);

          // Initial Welcome message
          const welcomeMessage = `Welcome to the Nabisunsa Career Advisory Desk. I am your academic counselor. Looking at your S5 Term 1 grades, you have outstanding performance in sciences. How best can I assist you and your parent today?`;
          
          setMessages([
            { id: '1', sender: 'ai', text: welcomeMessage, timestamp: new Date() }
          ]);
        }
      } catch (e) {
        console.error('Error loading student context for AI:', e);
      } finally {
        setLoadingContext(false);
      }
    }

    loadStudentContext();
  }, []);

  // Handle trigger of initialPrompt if passed from course details screen
  useEffect(() => {
    if (!loadingContext && initialPrompt && messages.length === 1) {
      sendMessage(initialPrompt);
    }
  }, [loadingContext, initialPrompt]);

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

      const { reply } = await askAdvisor(textToSend, history);

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

  if (loadingContext) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

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
          <Text style={[styles.navTitle, { color: colors.text }]}>Academic Advisor Desk</Text>
          <Text style={[styles.navSub, { color: colors.gold }]}>Powered by Gemini AI Studio</Text>
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
              onPress={() => sendMessage('What engineering courses do I qualify for at Makerere?')}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>Engineering cutoffs?</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.suggestChip, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
              onPress={() => sendMessage('Tell me about the holiday vacation design courses.')}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>Holiday vacation crafts?</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.suggestChip, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
              onPress={() => sendMessage('Can I do computer science with my current marks?')}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>Computer Science fit?</Text>
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
