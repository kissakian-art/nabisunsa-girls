import { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useColorScheme, Platform, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, MaxContentWidth } from '../../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Timestamp } from 'firebase/firestore';
import { saveLesson } from '../../services/db/lessons';
import { auth } from '../../services/firebase';

export default function PostLessonScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [googleDriveUrl, setGoogleDriveUrl] = useState('');
  const [pdfNotesName, setPdfNotesName] = useState('');
  
  const [level, setLevel] = useState<'O-Level' | 'A-Level'>('O-Level');
  const [classId, setClassId] = useState('Senior 1');
  const [selectedSubject, setSelectedSubject] = useState('o_mathematics');

  const oLevelSubjects = [
    { label: 'O-Maths', value: 'o_mathematics' },
    { label: 'O-Physics', value: 'o_physics' },
    { label: 'O-English', value: 'o_english' }
  ];

  const aLevelSubjects = [
    { label: 'A-Maths', value: 'a_mathematics' },
    { label: 'A-Physics', value: 'a_physics' },
    { label: 'A-Chemistry', value: 'a_chemistry' }
  ];

  const currentSubjects = level === 'O-Level' ? oLevelSubjects : aLevelSubjects;

  const handlePost = async () => {
    if (!title || !topic || !googleDriveUrl) {
      const msg = 'Please fill in Lesson Title, Topic, and Google Drive URL/ID.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Missing Fields', msg);
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      const lessonId = `lesson_${Date.now()}`;
      
      // Clean up Google Drive input (extract ID if full URL)
      const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || googleDriveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      const googleDriveId = fileIdMatch ? fileIdMatch[1] : googleDriveUrl.trim();

      const newLesson: any = {
        id: lessonId,
        teacherId: user?.uid || 'teacher_uid',
        subjectId: selectedSubject,
        classId: classId.replace('Senior ', 'S'),
        termId: '2026_term1',
        topic: topic.trim(),
        title: title.trim(),
        googleDriveId: googleDriveId,
        commentCount: 0,
        createdAt: Timestamp.now() as any
      };

      if (pdfNotesName.trim()) {
        newLesson.pdfAttachmentUrl = pdfNotesName.trim();
      }

      await saveLesson('nabisunsa_girls', newLesson);

      const successMsg = `E-learning lesson "${title}" published successfully to ${classId} ${selectedSubject.replace('o_', '').replace('a_', '').toUpperCase()}!`;
      if (Platform.OS === 'web') {
        alert(successMsg);
        router.back();
      } else {
        Alert.alert(
          'Lesson Published',
          successMsg,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      console.error('Error publishing lesson:', error);
      const errorMsg = `Publish failed: ${error.message || error}`;
      if (Platform.OS === 'web') alert(errorMsg);
      else Alert.alert('Error', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* Nav Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={[styles.backBtn, { borderColor: colors.gold }]} onPress={() => router.back()}>
          <FontAwesome5 name="arrow-left" size={14} color={colors.gold} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Lesson Setup</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Header */}
      <View style={styles.headerBlock}>
        <Text style={[styles.title, { color: colors.text }]}>Publish Video Lesson</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Post new Google Drive video links and PDF syllabus study guides for students to stream inline.
        </Text>
      </View>

      {/* Form Card */}
      <View style={[styles.formCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        
        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Lesson Title</Text>
          <TextInput
            style={[styles.inputField, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.background }]}
            placeholder="e.g. Introduction to First Principles of Calculus"
            placeholderTextColor={colors.textSecondary + '80'}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Topic */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Syllabus Topic</Text>
          <TextInput
            style={[styles.inputField, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.background }]}
            placeholder="e.g. Calculus & Integration"
            placeholderTextColor={colors.textSecondary + '80'}
            value={topic}
            onChangeText={setTopic}
          />
        </View>

        {/* Google Drive Link */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Google Drive Video Link or File ID</Text>
          <TextInput
            style={[styles.inputField, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.background }]}
            placeholder="Paste Google Drive file URL or ID here..."
            placeholderTextColor={colors.textSecondary + '80'}
            value={googleDriveUrl}
            onChangeText={setGoogleDriveUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* PDF Attachment filename */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Syllabus PDF Notes Filename (Optional)</Text>
          <TextInput
            style={[styles.inputField, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.background }]}
            placeholder="e.g. calculus_derivatives_intro.pdf"
            placeholderTextColor={colors.textSecondary + '80'}
            value={pdfNotesName}
            onChangeText={setPdfNotesName}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Level Track */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Academic Level Track</Text>
          <View style={styles.rowToggles}>
            <TouchableOpacity 
              style={[styles.toggleBtn, level === 'O-Level' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => {
                setLevel('O-Level');
                setClassId('Senior 1');
                setSelectedSubject('o_mathematics');
              }}
            >
              <Text style={[styles.toggleBtnText, { color: colors.text }, level === 'O-Level' && { color: '#FFFFFF' }]}>
                O-Level
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toggleBtn, level === 'A-Level' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => {
                setLevel('A-Level');
                setClassId('Senior 5');
                setSelectedSubject('a_mathematics');
              }}
            >
              <Text style={[styles.toggleBtnText, { color: colors.text }, level === 'A-Level' && { color: '#FFFFFF' }]}>
                A-Level
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Class Form Select */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Target Class Form</Text>
          <View style={styles.rowToggles}>
            {level === 'O-Level' ? (
              ['Senior 1', 'Senior 2', 'Senior 3', 'Senior 4'].map((cls) => (
                <TouchableOpacity 
                  key={cls}
                  style={[styles.toggleBtn, { flex: 1 }, classId === cls && { backgroundColor: colors.gold, borderColor: colors.gold }]}
                  onPress={() => setClassId(cls)}
                >
                  <Text style={[styles.toggleBtnText, { color: colors.text }, classId === cls && { color: '#FFFFFF' }]}>
                    {cls.replace('Senior ', 'S')}
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              ['Senior 5', 'Senior 6'].map((cls) => (
                <TouchableOpacity 
                  key={cls}
                  style={[styles.toggleBtn, { flex: 1 }, classId === cls && { backgroundColor: colors.gold, borderColor: colors.gold }]}
                  onPress={() => setClassId(cls)}
                >
                  <Text style={[styles.toggleBtnText, { color: colors.text }, classId === cls && { color: '#FFFFFF' }]}>
                    {cls.replace('Senior ', 'S')}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>

        {/* Subject module selection */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Subject Module</Text>
          <View style={styles.rowToggles}>
            {currentSubjects.map((sub) => (
              <TouchableOpacity 
                key={sub.value}
                style={[styles.toggleBtn, { flex: 1 }, selectedSubject === sub.value && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => setSelectedSubject(sub.value)}
              >
                <Text style={[styles.toggleBtnText, { color: colors.text }, selectedSubject === sub.value && { color: '#FFFFFF' }]}>
                  {sub.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save button */}
        <TouchableOpacity 
          style={[styles.publishBtn, { backgroundColor: colors.primary }]}
          onPress={handlePost}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <FontAwesome5 name="cloud-upload-alt" size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.publishBtnText}>Publish Video Lesson</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
    paddingBottom: Spacing.six,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.four,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerBlock: {
    marginBottom: Spacing.four,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  formCard: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    marginBottom: Spacing.four,
    shadowOpacity: 0.01,
    elevation: 1,
  },
  inputGroup: {
    marginBottom: Spacing.three,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  inputField: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    height: 44,
    paddingHorizontal: Spacing.three,
    fontSize: 13,
    width: '100%',
  },
  rowToggles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toggleBtn: {
    borderWidth: 1,
    borderColor: '#D4AF3740',
    borderRadius: Spacing.two,
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  publishBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  publishBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
