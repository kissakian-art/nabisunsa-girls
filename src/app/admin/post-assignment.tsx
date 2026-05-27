import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useColorScheme, Platform, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, MaxContentWidth } from '../../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { getSchoolStreams } from '../../services/db/users';

export default function PostAssignmentScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxMarks, setMaxMarks] = useState('100');
  const [selectedClass, setSelectedClass] = useState('S5');
  const [selectedSubject, setSelectedSubject] = useState('a_physics');

  const [selectedStream, setSelectedStream] = useState('Blue');
  const [availableStreams, setAvailableStreams] = useState<string[]>(['Blue', 'Red', 'Green']);

  useEffect(() => {
    async function loadStreams() {
      try {
        const list = await getSchoolStreams('nabisunsa_girls');
        setAvailableStreams(list);
        if (list.length > 0) {
          if (!list.includes(selectedStream)) {
            setSelectedStream(list[0]);
          }
        }
      } catch (err) {
        console.error('Error loading streams in post assignment:', err);
      }
    }
    loadStreams();
  }, []);

  const handlePost = async () => {
    if (!title || !description) {
      Alert.alert('Missing Info', 'Please input a title and description.');
      return;
    }

    setLoading(true);
    try {
      const assignmentId = `assignment_${Date.now()}`;
      const assignmentRef = doc(db, 'assignments', assignmentId);

      const newAssignment = {
        id: assignmentId,
        teacherId: 'teacher_uid',
        subjectId: selectedSubject,
        classId: selectedClass,
        stream: selectedStream,
        termId: '2026_term1',
        title: title.trim(),
        description: description.trim(),
        dueDate: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // Due in 7 days
        type: 'exercise',
        maxMarks: parseInt(maxMarks, 10) || 100,
        createdAt: Timestamp.now()
      };

      await setDoc(assignmentRef, newAssignment);

      const msg = `New coursework assignment published successfully to ${selectedClass} ${selectedSubject.toUpperCase()}!`;
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('Assignment Published', msg, [{ text: 'OK', onPress: () => router.back() }]);
      }
    } catch (e: any) {
      console.error('Error posting assignment:', e);
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
        <Text style={[styles.navTitle, { color: colors.text }]}>Assignment Setup</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Header */}
      <View style={styles.headerBlock}>
        <Text style={[styles.title, { color: colors.text }]}>Publish Coursework Assignment</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Post new coursework exercises, activities, or exams. Students and parents will be notified instantly on their billboard dashboards.
        </Text>
      </View>

      {/* Form Card */}
      <View style={[styles.formCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        
        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Assignment Title</Text>
          <TextInput
            style={[styles.inputField, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.background }]}
            placeholder="e.g. Newton's Equations of Motion Part B"
            placeholderTextColor={colors.textSecondary + '80'}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Max Marks */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Max Score Points</Text>
          <TextInput
            style={[styles.inputField, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.background }]}
            keyboardType="numeric"
            value={maxMarks}
            onChangeText={setMaxMarks}
            maxLength={3}
          />
        </View>

        {/* Class Selection Detail */}
        <View style={styles.metaRow}>
          <View style={{ flex: 1.2 }}>
            <Text style={[styles.label, { color: colors.text, marginBottom: 4 }]}>Target Class Stream</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
              {availableStreams.map((st) => (
                <TouchableOpacity 
                  key={st}
                  style={[
                    styles.streamPillMini, 
                    { borderColor: colors.gold + '30', backgroundColor: colors.background }, 
                    selectedStream === st && { backgroundColor: colors.primary, borderColor: colors.primary }
                  ]}
                  onPress={() => setSelectedStream(st)}
                >
                  <Text style={[styles.streamPillMiniText, { color: colors.text }, selectedStream === st && { color: '#FFFFFF', fontWeight: '700' }]}>
                    {selectedClass} {st}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View style={{ flex: 0.8 }}>
            <Text style={[styles.label, { color: colors.text, marginBottom: 4 }]}>Subject Module</Text>
            <Text style={[styles.metaVal, { color: colors.gold, marginTop: 4 }]}>{selectedSubject.replace('a_', '').toUpperCase()}</Text>
          </View>
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.text }]}>Detailed Prompts & Description</Text>
          <TextInput
            style={[styles.descField, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.background }]}
            placeholder="Outline the assignment guidelines, readings, and submission criteria..."
            placeholderTextColor={colors.textSecondary + '80'}
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </View>

        {/* Publish button */}
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
              <Text style={styles.publishBtnText}>Publish Assignment</Text>
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
    fontSize: 12,
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
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginBottom: Spacing.three,
    backgroundColor: '#0F20420A',
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  metaVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  descField: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    fontSize: 12,
    height: 100,
    textAlignVertical: 'top',
  },
  publishBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  publishBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  streamPillMini: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streamPillMiniText: {
    fontSize: 11,
  },
});
