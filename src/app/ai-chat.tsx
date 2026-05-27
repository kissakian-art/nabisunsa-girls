import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, useColorScheme, Platform, KeyboardAvoidingView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { auth } from '../services/firebase';
import { getUserProfile } from '../services/db/users';
import { getStudentMarksForTerm } from '../services/db/marks';
import { getCourses } from '../services/db/courses';
import { getRecommendations, RecommendationResult } from '../services/careerAdvisor';
import { User, Marks } from '../types';
import { Colors, Spacing, MaxContentWidth } from '../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

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
      const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

      if (apiKey && apiKey !== 'YOUR_GEMINI_API_KEY') {
        // A. Live Gemini API execution
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Exclude the initial greeting from the history sent to the model, as Gemini expects chat history to start with a 'user' message.
        const chatHistory = messages
          .slice(1) // Exclude the first message (which is always the AI welcome message)
          .map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }],
          }));

        const chat = model.startChat({
          history: chatHistory,
          systemInstruction: {
            role: 'system',
            parts: [{ text: systemPrompt }],
          },
        });

        const result = await chat.sendMessage(textToSend);
        const responseText = result.response.text();

        const aiMsg: ChatMessage = {
          id: Math.random().toString(),
          sender: 'ai',
          text: responseText,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        // B. Dynamic Mock Counselor Fallback (Robust Developer Showcase)
        await new Promise(resolve => setTimeout(resolve, 1200)); // Simulate thinking

        const query = textToSend.toLowerCase();
        let reply = '';

        if (query === 'hi' || query === 'hello' || query === 'hey' || query === 'greetings') {
          reply = `Hello ${userProfile?.displayName || 'Student'}! I am your Nabisunsa Academic Advisor. How can I assist you or your parent today with your career and course choices?`;
        } else if (query.includes('thanks') || query.includes('thank you')) {
          reply = `You are welcome, ${userProfile?.displayName || 'my dear student'}. It is our pride at Nabisunsa Girls' Secondary School to nurture excellent career paths. Please let me know if you or your parents have any more questions!`;
        } else if (query.includes('computer science') || query.includes('computer') || query.includes('companies')) {
          reply = `Makerere University (MUK) is Uganda's premier institution for Computer Science (cutoff 43.1). Top companies in Uganda that hire computer science graduates include MTN, Airtel, Stanbic Bank, Centenary Bank, and international tech hubs like Safaricom, Andela, plus key government departments like NITA-U. Given your strong performance in Sciences, this is a brilliant fit for you!`;
        } else if (query.includes('kyambogo') || query.includes('kyu')) {
          reply = `Kyambogo University (KYU) has outstanding engineering and vocational programs. For example, their Bachelor of Electrical Engineering has a JAB cutoff of 47.4. They emphasize practical laboratory work, making their graduates highly sought after in Ugandan industries.`;
        } else if (query.includes('medicine') || query.includes('pharmacy') || query.includes('doctor') || query.includes('nurse')) {
          reply = `Medicine (MAM) at Makerere has a cutoff of 49.7, and Pharmacy (PHA) has 48.9. Since you have strong chemistry and biology backgrounds, these are prestigious choices. If government entry is highly competitive, you also qualify for Direct Entry at MUST, KIU, or UCU.`;
        } else if (query.includes('direct') || query.includes('mbarara') || query.includes('must') || query.includes('kiu') || query.includes('ucu') || query.includes('gulu') || query.includes('busitema')) {
          reply = `For universities like MUST, KIU, UCU, and Gulu, admissions are governed by the Direct Entry system rather than strict points-based JAB cutoffs. They require a minimum of 2 Principal Passes at UACE (A-Level) and 5 passes at UCE (O-Level). Since you currently have solid passes in your principal subjects, you qualify comfortably for Direct Entry in these premium institutions!`;
        } else if (query.includes('engineering') || query.includes('civil') || query.includes('electrical')) {
          reply = `Engineering at Makerere requires high JAB weights. The official cutoff for Civil Engineering (CIV) is 49.7, and Kyambogo Electrical (BEL) is 47.4. Your current marks put you on a strong track for private entry, and with dedicated continuous assessment effort, you can target government admission!`;
        } else if (query.includes('holiday') || query.includes('vocational') || query.includes('skills')) {
          reply = `For vacation skills, we highly recommend the 6-Month Certificate in Fashion, Crested Design & Tailoring at Watoto Skills Care. It builds immediate wealth-generating capabilities during holidays, which parents highly value.`;
        } else if (query.includes('law') || query.includes('arts') || query.includes('literature')) {
          reply = `To qualify for LLB at Makerere (cutoff: 55%), you must pass their Law Pre-Entry exams. Alternatively, Uganda Christian University (UCU) offers direct entry with 2 Principal Passes and a Credit 3 in O-Level English, which is highly prestigious and suited to Nabisunsa's standards.`;
        } else {
          reply = `That is a very thoughtful question. As a science student here at Nabisunsa Girls' Secondary School, I encourage you to check specific course weight requirements. Would you like to explore Makerere University's cutoff points for science programs, or discuss direct entry options at other universities like MUST or UCU?`;
        }

        const aiMsg: ChatMessage = {
          id: Math.random().toString(),
          sender: 'ai',
          text: reply,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMsg]);
      }
    } catch (e: any) {
      console.error('Gemini error:', e);
      const errRef: ChatMessage = {
        id: Math.random().toString(),
        sender: 'ai',
        text: `My apologies. I encountered a communication hiccup connecting to Google Generative AI: ${e.message || e}. Please verify your EXPO_PUBLIC_GEMINI_API_KEY setup in your environment configs!`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errRef]);
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
